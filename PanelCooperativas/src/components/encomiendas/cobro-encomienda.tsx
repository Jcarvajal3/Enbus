"use client";

// ─── Cobro de una encomienda en taquilla (contenido reutilizable) ───────────
// - `CobroEncomiendaContenido`: resumen + estado del cobro. Si el cliente ya
//   reportó un pago desde la app, se verifica con el diálogo único de pagos
//   (VerificarPagoDialog embebido); si no, muestra `CobroEncomiendaForm`. Lo usan
//   la fase "Cobro" de la página de nueva encomienda y `PagoModal`.
// - `CobroEncomiendaForm`: "¿Cómo pagó el cliente?" (Efectivo Bs, Efectivo USD,
//   Punto de venta, Pago Móvil, Transferencia, Zelle) con confirmación antes de
//   registrar el cobro. También lo usa la entrega en destino (entrega-modal).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Bank, CheckCircle, CreditCard, CurrencyDollar, DeviceMobile, Money, Warning, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BancoField, Campo, FechaField, MontoField } from "@/components/campos";
import { Monto } from "@/components/monto";
import { ComprobanteCobro, useComprobanteCobro } from "@/components/pagos/comprobante-cobro";
import { AvisoError } from "@/components/aviso-error";
import { ConfirmDialog, type ResultadoConfirmacion } from "@/components/confirm-dialog";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { createClient } from "@/lib/supabase/client";
import { formatBs, formatUsd, leerMonto, usdABs } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { ErrorState } from "@/components/error-state";
import { remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { hoyVE, sumarDiasVE } from "@/lib/fechas";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { CobroEncomienda, MonedaPago, TipoMetodoPago } from "@/lib/types/pagos";
import type { MetodoPagoCooperativa } from "@/lib/types/configuracion";
import {
  obtenerEstadoCobro,
  procesarPago,
  type EstadoCobroEncomienda,
} from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";

const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

/** Clave de idempotencia de un intento de cobro (se conserva entre reintentos). */
function nuevaClave(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function formatEnMoneda(monto: number, moneda: MonedaPago) {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

type OpcionCobro = "EFECTIVO_VES" | "EFECTIVO_USD" | "PUNTO_DE_VENTA" | "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

// Mismos mosaicos e iconos que el cobro de boletos (PU-16, §2.3).
const OPCIONES: { valor: OpcionCobro; etiqueta: string; tipo: TipoMetodoPago; moneda: MonedaPago; icono: Icon }[] = [
  { valor: "EFECTIVO_VES", etiqueta: "Efectivo Bs", tipo: "EFECTIVO", moneda: "VES", icono: Money },
  { valor: "EFECTIVO_USD", etiqueta: "Efectivo USD", tipo: "EFECTIVO", moneda: "USD", icono: Money },
  { valor: "PUNTO_DE_VENTA", etiqueta: "Punto de venta", tipo: "PUNTO_DE_VENTA", moneda: "VES", icono: CreditCard },
  { valor: "PAGO_MOVIL", etiqueta: "Pago Móvil", tipo: "PAGO_MOVIL", moneda: "VES", icono: DeviceMobile },
  { valor: "TRANSFERENCIA_BANCARIA", etiqueta: "Transferencia", tipo: "TRANSFERENCIA_BANCARIA", moneda: "VES", icono: Bank },
  { valor: "ZELLE", etiqueta: "Zelle", tipo: "ZELLE", moneda: "USD", icono: CurrencyDollar },
];

const NOMBRE_METODO: Record<TipoMetodoPago, string> = {
  EFECTIVO: "efectivo",
  PUNTO_DE_VENTA: "punto de venta",
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "transferencia",
  ZELLE: "Zelle",
};

type CampoCobro = "monto" | "referencia" | "banco" | "fecha" | "metodo";

/** Cuenta de la cooperativa: "Banesco ••••4567 (Transportes C.A.)" / "pagos@coop.com". */
function etiquetaCuenta(m: MetodoPagoCooperativa) {
  if (m.tipo === "ZELLE") return `${m.email_zelle ?? "Zelle"} (${m.titular})`;
  const final = (m.numero_cuenta ?? "").replace(/\D/g, "").slice(-4);
  return `${m.banco ?? "Cuenta"}${final ? ` ••••${final}` : ""} (${m.titular})`;
}

export type EncomiendaACobrar = Pick<Encomienda, "id" | "tracking_id" | "costo_calculado" | "cooperativa_id">;

export type CobroEncomiendaFormProps = {
  encomienda: EncomiendaACobrar;
  /** El cobro quedó registrado (aprobado). */
  onCobrado: (r: CobroEncomienda) => void;
  /** El servidor dice que el estado cambió (pago pendiente nuevo, ya pagada…): recargar. */
  onCambioExterno?: () => void;
  disabled?: boolean;
};

/** "¿Cómo pagó el cliente?": registra un cobro en taquilla con fn_cobrar_encomienda_taquilla. */
export function CobroEncomiendaForm({ encomienda, onCobrado, onCambioExterno, disabled = false }: CobroEncomiendaFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const tasa = useTasaBCV();
  const idBase = useId();

  const [opcion, setOpcion] = useState<OpcionCobro | null>(null);
  const [cuentas, setCuentas] = useState<MetodoPagoCooperativa[]>([]);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const [recibido, setRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [fecha, setFecha] = useState(() => hoyVE());
  const [errores, setErrores] = useState<Partial<Record<CampoCobro, string>>>({});
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const comprobante = useComprobanteCobro();
  const [enviando, setEnviando] = useState(false);
  // Misma clave en todos los reintentos de este cobro: un doble clic no cobra dos veces.
  const [idemKey] = useState(() => nuevaClave());

  // Cuentas activas de la cooperativa (para indicar a cuál llegó el pago digital).
  useEffect(() => {
    if (!encomienda.cooperativa_id) return;
    let activo = true;
    const cargarCuentas = async () => {
      const { data, error } = await supabase
        .from("metodos_pago_cooperativa")
        .select("id, cooperativa_id, tipo, banco, titular, numero_cuenta, cedula_rif, email_zelle, instrucciones, activo, created_at")
        .eq("cooperativa_id", encomienda.cooperativa_id)
        .eq("activo", true)
        .order("created_at", { ascending: true });
      if (!activo) return;
      // Sin cuentas (o si fallan), el cobro se registra sin cuenta: el servidor lo acepta.
      setCuentas(error ? [] : ((data as MetodoPagoCooperativa[] | null) ?? []));
    };
    void cargarCuentas();
    return () => {
      activo = false;
    };
  }, [supabase, encomienda.cooperativa_id]);

  const opcionActual = OPCIONES.find((o) => o.valor === opcion) ?? null;
  const efectivo = opcionActual?.tipo === "EFECTIVO";
  // Punto de venta: solo referencia del comprobante y fecha (sin cuenta, banco ni vuelto).
  const puntoVenta = opcionActual?.tipo === "PUNTO_DE_VENTA";
  const moneda: MonedaPago = opcionActual?.moneda ?? "VES";
  const costoUsd = Number(encomienda.costo_calculado ?? 0);
  const totalBs = tasa ? usdABs(costoUsd, tasa.tasa) : null;
  const esperado = moneda === "USD" ? costoUsd : totalBs;
  const montoRecibido = leerMonto(recibido);
  const diferencia = efectivo && esperado != null && montoRecibido != null ? montoRecibido - esperado : null;

  const cuentasDelTipo = opcionActual && !efectivo && !puntoVenta ? cuentas.filter((c) => c.tipo === opcionActual.tipo) : [];
  const cuentaId =
    cuentaElegida && cuentasDelTipo.some((c) => c.id === cuentaElegida)
      ? cuentaElegida
      : cuentasDelTipo.length === 1
        ? cuentasDelTipo[0].id
        : null;
  const cuenta = cuentasDelTipo.find((c) => c.id === cuentaId) ?? null;

  const limpiarError = (campo: CampoCobro) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const elegirOpcion = (valor: OpcionCobro) => {
    setOpcion(valor);
    setErrores({});
    setRecibido("");
    // El efectivo no lleva comprobante.
    if (valor === "EFECTIVO_VES" || valor === "EFECTIVO_USD") comprobante.descartar();
  };

  /** Validación local antes de pedir confirmación (el servidor valida de nuevo). */
  const validar = (): boolean => {
    const nuevos: Partial<Record<CampoCobro, string>> = {};
    if (!opcionActual) {
      nuevos.metodo = "Elige cómo pagó el cliente.";
    } else if (efectivo) {
      if (montoRecibido == null || montoRecibido <= 0) {
        nuevos.monto = "Escribe cuánto dinero te entregó el cliente.";
      } else if (esperado != null && montoRecibido + 0.005 < esperado) {
        nuevos.monto = `El monto recibido es menor que el total a cobrar (${formatEnMoneda(esperado, moneda)}).`;
      }
    } else {
      const ref = referencia.replace(/[\s._/-]/g, "").toUpperCase();
      if (opcionActual.tipo === "ZELLE") {
        if (!/^[A-Z0-9]{4,40}$/.test(ref)) {
          nuevos.referencia = "Escribe el código de confirmación de Zelle completo (mínimo 4 caracteres).";
        }
      } else if (puntoVenta) {
        if (!/^\d{4,30}$/.test(ref)) {
          nuevos.referencia = "Escribe la referencia del comprobante del punto: solo números, mínimo 4.";
        }
      } else {
        if (!/^\d{4,30}$/.test(ref)) {
          nuevos.referencia = "Escribe el número de referencia completo: solo números, mínimo 4.";
        }
        if (!banco.trim()) nuevos.banco = "Elige el banco desde el que pagó el cliente.";
      }
      const hoy = hoyVE();
      if (!fecha || fecha > hoy || fecha < sumarDiasVE(hoy, -30)) {
        nuevos.fecha = "La fecha del pago debe estar entre hoy y los últimos 30 días.";
      }
    }
    setErrores(nuevos);
    return Object.values(nuevos).every((v) => !v);
  };

  const pedirConfirmacion = () => {
    if (disabled || enviando) return;
    if (validar()) setConfirmarOpen(true);
  };

  /** Registra el cobro desde la confirmación: el error general se ve dentro de ella. */
  const registrar = async (): Promise<ResultadoConfirmacion> => {
    if (!opcionActual) return { ok: false, error: "Elige cómo pagó el cliente." };
    setEnviando(true);
    try {
      // El comprobante (opcional) se sube al cobrar; el cobro espera a que termine.
      const subida = efectivo ? ({ ok: true, path: null } as const) : await comprobante.subir();
      if (!subida.ok) return { ok: false, error: subida.error };
      const res = await requireOnline(() =>
        procesarPago({
          encomiendaId: encomienda.id,
          cobro: {
            metodoTipo: opcionActual.tipo,
            metodoPagoId: efectivo || puntoVenta ? null : cuentaId,
            moneda: efectivo ? opcionActual.moneda : null,
            montoRecibido: efectivo ? montoRecibido : null,
            referencia: efectivo ? null : referencia,
            fecha: efectivo ? null : fecha,
            banco: efectivo || puntoVenta || opcionActual.tipo === "ZELLE" ? null : banco,
            comprobantePath: subida.path,
            idemKey,
          },
        })
      )();
      if (res.success) {
        const cobro = res.data.cobro;
        if (cobro?.repetido) {
          avisarInfo("Este cobro ya estaba registrado.");
        } else if (cobro && cobro.vuelto && cobro.vuelto > 0) {
          avisarExito(`Cobro registrado. Vuelto: ${formatEnMoneda(cobro.vuelto, cobro.moneda ?? moneda)}.`);
        } else {
          avisarExito("Cobro registrado.");
        }
        if (cobro) onCobrado(cobro);
        return { ok: true };
      }
      const campo = res.detalle?.campo as CampoCobro | undefined;
      if (res.codigo === "EB_MONTO_INSUFICIENTE" && typeof res.detalle?.esperado === "number") {
        // El servidor cobra con la tasa vigente: puede diferir de la que muestra esta pantalla.
        const totalServidor = formatEnMoneda(res.detalle.esperado, res.detalle.moneda === "USD" ? "USD" : "VES");
        setErrores((prev) => ({ ...prev, monto: `El monto recibido es menor que el total a cobrar (${totalServidor}).` }));
        return { ok: true };
      }
      if (campo && ["monto", "referencia", "banco", "fecha"].includes(campo)) {
        // El error queda junto a su campo, en el formulario.
        setErrores((prev) => ({ ...prev, [campo]: res.error }));
        return { ok: true };
      }
      if (
        res.codigo === "EB_PAGO_PENDIENTE_EXISTE" ||
        res.codigo === "EB_PAGO_YA_REGISTRADO" ||
        res.codigo === "EB_ESTADO_CAMBIO"
      ) {
        // El cobro cambió por fuera (otro compañero, un pago desde la app): se recarga el estado.
        avisarError(res.error);
        onCambioExterno?.();
        return { ok: true };
      }
      return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: mensajeExcepcion(err, "registrar el cobro") };
    } finally {
      setEnviando(false);
    }
  };

  const id = (s: string) => `${idBase}-${s}`;
  const sinCosto = !(costoUsd > 0);
  const totalTexto = moneda === "USD" || totalBs == null ? formatUsd(costoUsd) : formatBs(totalBs);
  const hoy = hoyVE();

  return (
    <div className="flex flex-col gap-5">
      {sinCosto && <AvisoError>Todavía no tiene costo: recíbela y pésala primero.</AvisoError>}
      {!tasa && !sinCosto && <AvisoError>Sin tasa BCV de hoy: no se puede cobrar.</AvisoError>}

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">¿Cómo pagó?</p>
        <GrupoOpciones etiqueta="¿Cómo pagó?" className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {OPCIONES.map((o) => (
            <OpcionTile
              key={o.valor}
              seleccionado={opcion === o.valor}
              onSelect={() => elegirOpcion(o.valor)}
              icono={o.icono}
              titulo={o.etiqueta}
              disabled={disabled || enviando}
              className="items-center px-2 text-center"
            />
          ))}
        </GrupoOpciones>
        {errores.metodo && (
          <p role="alert" className="text-[13px] text-destructive-text">
            {errores.metodo}
          </p>
        )}
      </div>

      {opcionActual && !sinCosto && (
        // Enter en cualquier campo pide confirmar el cobro.
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!enviando && tasa) pedirConfirmacion();
          }}
        >
          {efectivo ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MontoField
                id={id("recibido")}
                label="Monto recibido"
                moneda={moneda === "USD" ? "USD" : "Bs"}
                value={recibido}
                onChange={(v) => {
                  setRecibido(v);
                  limpiarError("monto");
                }}
                error={errores.monto}
                ayuda="Para calcular el vuelto."
                enterKeyHint="done"
                // Al elegir efectivo el foco va al monto; Enter pide confirmar el cobro.
                autoFocus
                disabled={disabled || enviando}
              />
              <div aria-live="polite" className="flex flex-col gap-1 self-start rounded-md bg-surface p-4">
                <p className="text-[13px] font-medium text-muted-foreground">Vuelto</p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    diferencia != null && diferencia < -0.004 && "text-destructive-text"
                  )}
                >
                  {diferencia == null
                    ? "—"
                    : diferencia < -0.004
                      ? `Faltan ${formatEnMoneda(-diferencia, moneda)}`
                      : formatEnMoneda(Math.max(diferencia, 0), moneda)}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {!puntoVenta && (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-medium">Cuenta que recibió el pago</p>
                  {cuentasDelTipo.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      Sin cuentas de {NOMBRE_METODO[opcionActual.tipo]} activas: se registra sin cuenta.
                    </p>
                  ) : (
                    <GrupoOpciones etiqueta="Cuenta que recibió el pago" className="grid gap-2 md:grid-cols-2">
                      {cuentasDelTipo.map((c) => (
                        <OpcionTile
                          key={c.id}
                          seleccionado={cuentaId === c.id}
                          onSelect={() => setCuentaElegida(c.id)}
                          disabled={disabled || enviando}
                          titulo={etiquetaCuenta(c)}
                        />
                      ))}
                    </GrupoOpciones>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Campo
                  id={id("referencia")}
                  label={
                    opcionActual.tipo === "ZELLE"
                      ? "Código de confirmación"
                      : puntoVenta
                        ? "Referencia del comprobante"
                        : "Número de referencia"
                  }
                  value={referencia}
                  onChange={(v) => {
                    setReferencia(v);
                    limpiarError("referencia");
                  }}
                  error={errores.referencia}
                  inputMode={opcionActual.tipo === "ZELLE" ? "text" : "numeric"}
                  placeholder={opcionActual.tipo === "ZELLE" ? "Ej. ABC123XYZ" : "Ej. 00123456"}
                  mayusculas={opcionActual.tipo === "ZELLE"}
                  enterKeyHint="next"
                  disabled={disabled || enviando}
                />
                <FechaField
                  id={id("fecha")}
                  label="Fecha del pago"
                  value={fecha}
                  onChange={(v) => {
                    setFecha(v);
                    limpiarError("fecha");
                  }}
                  min={sumarDiasVE(hoy, -30)}
                  max={hoy}
                  error={errores.fecha}
                  atajos={false}
                  disabled={disabled || enviando}
                />
                {opcionActual.tipo !== "ZELLE" && !puntoVenta && (
                  <BancoField
                    id={id("banco")}
                    label="Banco del cliente"
                    value={banco}
                    onChange={(v) => {
                      setBanco(v);
                      limpiarError("banco");
                    }}
                    error={errores.banco}
                    disabled={disabled || enviando}
                    className="md:col-span-2"
                  />
                )}
              </div>
              <ComprobanteCobro
                archivo={comprobante.archivo}
                onArchivo={comprobante.elegir}
                error={comprobante.error}
                subiendo={comprobante.subiendo}
                disabled={disabled || enviando}
                etiqueta={puntoVenta ? "Voucher del punto (opcional)" : "Comprobante de pago (opcional)"}
              />
              <p className="text-[13px] text-muted-foreground">
                {puntoVenta ? "Regístralo cuando el punto apruebe el pago." : "Regístralo cuando ya lo veas en la cuenta."}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-popover max-md:pb-1 max-md:*:w-full">
            <Button type="submit" size="xl" disabled={disabled || enviando || !tasa}>
              Cobrar {totalTexto}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        titulo={
          efectivo ? "¿Registrar el cobro en efectivo?" : `¿Registrar el pago por ${opcionActual ? NOMBRE_METODO[opcionActual.tipo] : ""}?`
        }
        descripcion={
          efectivo ? (
            <p>
              Recibiste <strong className="text-foreground">{montoRecibido != null ? formatEnMoneda(montoRecibido, moneda) : "—"}</strong>{" "}
              por <strong className="font-mono text-foreground">{encomienda.tracking_id}</strong>
              {esperado != null && <> (total {formatEnMoneda(esperado, moneda)})</>}.
              {diferencia != null && diferencia > 0.004 && (
                <>
                  {" "}
                  Vuelto: <strong className="text-foreground">{formatEnMoneda(diferencia, moneda)}</strong>.
                </>
              )}{" "}
              No se puede deshacer.
            </p>
          ) : puntoVenta ? (
            <p>
              Confirma que el punto de venta aprobó{" "}
              <strong className="text-foreground">{esperado != null ? formatEnMoneda(esperado, moneda) : formatUsd(costoUsd)}</strong>{" "}
              con la referencia <strong className="font-mono text-foreground">{referencia.trim()}</strong>. No se puede deshacer.
            </p>
          ) : (
            <p>
              Confirma que en {cuenta ? etiquetaCuenta(cuenta) : "la cuenta de la cooperativa"} ya aparece{" "}
              <strong className="text-foreground">{esperado != null ? formatEnMoneda(esperado, moneda) : formatUsd(costoUsd)}</strong>{" "}
              con la referencia <strong className="font-mono text-foreground">{referencia.trim()}</strong>. No se puede deshacer.
            </p>
          )
        }
        verbo="Registrar cobro"
        verboCargando="Registrando…"
        onConfirm={registrar}
      />
    </div>
  );
}

// ─── Estado del cobro en la taquilla de origen ──────────────────────────────

export interface CobroEncomiendaContenidoProps {
  encomienda: Encomienda;
  /** El cobro quedó registrado o aprobado. */
  onSuccess: (encomiendaId: string) => void;
  /** Se cerró la verificación del pago reportado sin resolverla (quien lo monta decide: cerrar o seguir). */
  onCerrar?: () => void;
}

/** Resumen de la encomienda + "¿Cómo pagó?" o la verificación del pago que reportó el cliente. */
export function CobroEncomiendaContenido({ encomienda, onSuccess, onCerrar }: CobroEncomiendaContenidoProps) {
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cobro, setCobro] = useState<EstadoCobroEncomienda | null>(null);
  const peticionRef = useRef(0);
  // VerificarPagoDialog llama onResuelto y justo después onOpenChange(false): ese
  // cierre no debe cerrar el contenedor (aprobado → sigue; rechazado → cobrar de nuevo).
  const resueltoRef = useRef(false);

  const cargar = useCallback(async () => {
    const n = ++peticionRef.current;
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await obtenerEstadoCobro(encomienda.id);
      if (n !== peticionRef.current) return;
      if (res.success) setCobro(res.data);
      else setErrorCarga(res.error);
    } catch (err) {
      if (n !== peticionRef.current) return;
      setErrorCarga(mensajeExcepcion(err, "revisar el pago de la encomienda"));
    } finally {
      if (n === peticionRef.current) setCargando(false);
    }
  }, [encomienda.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga asíncrona al montar
    void cargar();
    const peticiones = peticionRef;
    return () => {
      peticiones.current++;
    };
  }, [cargar]);

  const modalidad =
    encomienda.modalidad_pago === "DESTINO"
      ? `${MODALIDAD_PAGO.DESTINO.largo}. Quien envía puede pagar ahora.`
      : `${MODALIDAD_PAGO.ORIGEN.largo}.`;

  let cuerpo: React.ReactNode;
  if (cargando && !cobro) {
    cuerpo = (
      <div className="flex flex-col gap-4" role="status" aria-label="Revisando si el cliente ya reportó un pago">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-full" />
      </div>
    );
  } else if (errorCarga && !cobro) {
    cuerpo = <ErrorState compacto titulo="No pudimos revisar el pago" descripcion={errorCarga} onReintentar={cargar} />;
  } else if (cobro?.aprobado) {
    cuerpo = (
      <div className="flex flex-col gap-3">
        <p role="status" className="flex items-start gap-2 rounded-md bg-success-light p-4 text-[15px] text-success-deep">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
          Ya está pagada.
        </p>
        <Button type="button" size="lg" onClick={() => onSuccess(encomienda.id)}>
          Continuar
        </Button>
      </div>
    );
  } else if (cobro?.pendiente) {
    cuerpo = (
      <VerificarPagoDialog
        embebido
        open
        pagoId={cobro.pendiente.id}
        onOpenChange={(abierto) => {
          if (abierto) return;
          if (resueltoRef.current) {
            resueltoRef.current = false;
            return;
          }
          onCerrar?.();
        }}
        onResuelto={({ aprobado }) => {
          resueltoRef.current = true;
          if (aprobado) onSuccess(encomienda.id);
          else void cargar();
        }}
      />
    );
  } else {
    cuerpo = (
      <div className="flex flex-col gap-4">
        {cobro?.rechazado && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-warning-light p-4 text-[15px] text-warning-deep">
            <Warning weight="fill" className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
            <span>
              El cliente reportó un pago que se rechazó
              {cobro.rechazado.numeroReferencia ? ` (ref. ${cobro.rechazado.numeroReferencia})` : ""}
              {cobro.rechazado.motivo ? `: ${cobro.rechazado.motivo}` : ""}. Cóbrale de nuevo.
            </span>
          </p>
        )}
        <CobroEncomiendaForm
          encomienda={encomienda}
          onCobrado={() => onSuccess(encomienda.id)}
          onCambioExterno={() => void cargar()}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section aria-label="Resumen" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-surface p-4 text-[15px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] text-muted-foreground">Remitente</p>
          <p className="truncate font-medium">{remitenteDe(encomienda).nombre}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] text-muted-foreground">Destinatario</p>
          <p className="truncate font-medium">{encomienda.receiver_nombre}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] text-muted-foreground">Peso</p>
          <p className="font-medium tabular-nums">
            {encomienda.peso_kg ? `${String(encomienda.peso_kg).replace(".", ",")} kg` : "Por pesar"}
          </p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] text-muted-foreground">Total a cobrar</p>
          <Monto usd={encomienda.costo_calculado} size="xl" />
        </div>
        <p className="col-span-2 text-muted-foreground">{modalidad}</p>
      </section>

      {cuerpo}
    </div>
  );
}
