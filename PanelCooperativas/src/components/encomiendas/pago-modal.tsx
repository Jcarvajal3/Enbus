"use client";

// ─── Cobro de una encomienda en taquilla ────────────────────────────────────
// - Si el cliente ya reportó un pago desde la app: se verifica con el diálogo
//   único de pagos (VerificarPagoDialog embebido).
// - Si no: "¿Cómo pagó el cliente?" (Efectivo Bs, Efectivo USD, Pago Móvil,
//   Transferencia, Zelle) con confirmación antes de registrar el cobro.
// `CobroEncomiendaForm` también lo usa la entrega en destino (entrega-modal).

import { formatCiudad } from "@/lib/ciudades";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Bank, CheckCircle, CurrencyDollar, DeviceMobile, Money, Warning, type Icon } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import { AvisoError } from "@/components/aviso-error";
import { ConfirmDialog, type ResultadoConfirmacion } from "@/components/confirm-dialog";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { createClient } from "@/lib/supabase/client";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { OPCIONES_BANCO } from "@/lib/bancos";
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

/**
 * "3.024,50", "3024,5" o "3024.50" -> 3024.5; "3.024" y "1.250.000" son miles
 * (formato venezolano). Devuelve null si no es un número válido.
 */
function parseMontoVE(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,]/g, "");
  if (!limpio) return null;
  let normal: string;
  if (limpio.includes(",")) {
    normal = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, "");
  } else {
    normal = limpio;
  }
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function formatEnMoneda(monto: number, moneda: MonedaPago) {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

type OpcionCobro = "EFECTIVO_VES" | "EFECTIVO_USD" | "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

// Mismos mosaicos e iconos que el cobro de boletos (PU-16, §2.3).
const OPCIONES: { valor: OpcionCobro; etiqueta: string; tipo: TipoMetodoPago; moneda: MonedaPago; icono: Icon }[] = [
  { valor: "EFECTIVO_VES", etiqueta: "Efectivo Bs", tipo: "EFECTIVO", moneda: "VES", icono: Money },
  { valor: "EFECTIVO_USD", etiqueta: "Efectivo USD", tipo: "EFECTIVO", moneda: "USD", icono: Money },
  { valor: "PAGO_MOVIL", etiqueta: "Pago Móvil", tipo: "PAGO_MOVIL", moneda: "VES", icono: DeviceMobile },
  { valor: "TRANSFERENCIA_BANCARIA", etiqueta: "Transferencia", tipo: "TRANSFERENCIA_BANCARIA", moneda: "VES", icono: Bank },
  { valor: "ZELLE", etiqueta: "Zelle", tipo: "ZELLE", moneda: "USD", icono: CurrencyDollar },
];

const NOMBRE_METODO: Record<TipoMetodoPago, string> = {
  EFECTIVO: "efectivo",
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "transferencia",
  ZELLE: "Zelle",
};

type Campo = "monto" | "referencia" | "banco" | "fecha" | "metodo";

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
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [confirmarOpen, setConfirmarOpen] = useState(false);
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
  const moneda: MonedaPago = opcionActual?.moneda ?? "VES";
  const costoUsd = Number(encomienda.costo_calculado ?? 0);
  const totalBs = tasa ? usdABs(costoUsd, tasa.tasa) : null;
  const esperado = moneda === "USD" ? costoUsd : totalBs;
  const montoRecibido = parseMontoVE(recibido);
  const diferencia = efectivo && esperado != null && montoRecibido != null ? montoRecibido - esperado : null;

  const cuentasDelTipo = opcionActual && !efectivo ? cuentas.filter((c) => c.tipo === opcionActual.tipo) : [];
  const cuentaId =
    cuentaElegida && cuentasDelTipo.some((c) => c.id === cuentaElegida)
      ? cuentaElegida
      : cuentasDelTipo.length === 1
        ? cuentasDelTipo[0].id
        : null;
  const cuenta = cuentasDelTipo.find((c) => c.id === cuentaId) ?? null;

  const limpiarError = (campo: Campo) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const elegirOpcion = (valor: OpcionCobro) => {
    setOpcion(valor);
    setErrores({});
    setRecibido("");
  };

  /** Validación local antes de pedir confirmación (el servidor valida de nuevo). */
  const validar = (): boolean => {
    const nuevos: Partial<Record<Campo, string>> = {};
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
      } else {
        if (!/^\d{4,30}$/.test(ref)) {
          nuevos.referencia = "Escribe el número de referencia completo: solo números, mínimo 4.";
        }
        if (!banco.trim()) nuevos.banco = "Escribe el banco desde el que pagó el cliente.";
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
      const res = await requireOnline(() =>
        procesarPago({
          encomiendaId: encomienda.id,
          cobro: {
            metodoTipo: opcionActual.tipo,
            metodoPagoId: efectivo ? null : cuentaId,
            moneda: efectivo ? opcionActual.moneda : null,
            montoRecibido: efectivo ? montoRecibido : null,
            referencia: efectivo ? null : referencia,
            fecha: efectivo ? null : fecha,
            banco: efectivo || opcionActual.tipo === "ZELLE" ? null : banco,
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
      const campo = res.detalle?.campo as Campo | undefined;
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
  const alPulsarEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !enviando && tasa) {
      e.preventDefault();
      pedirConfirmacion();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {sinCosto && <AvisoError>Todavía no tiene costo: recíbela y pésala primero.</AvisoError>}
      {!tasa && !sinCosto && <AvisoError>Sin tasa BCV de hoy: no se puede cobrar.</AvisoError>}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">¿Cómo pagó?</p>
        <GrupoOpciones etiqueta="¿Cómo pagó?" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
        {errores.metodo && <p className="text-sm text-destructive-text">{errores.metodo}</p>}
      </div>

      {opcionActual && !sinCosto && (
        <div className="flex flex-col gap-4">
          {efectivo ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={id("recibido")}>Monto recibido ({moneda === "USD" ? "USD" : "Bs"})</Label>
                <Input
                  id={id("recibido")}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={esperado != null ? `Ej.: ${formatEnMoneda(esperado, moneda)}` : undefined}
                  value={recibido}
                  // Al elegir efectivo el foco va al monto; Enter pide confirmar el cobro.
                  autoFocus
                  disabled={disabled || enviando}
                  aria-invalid={errores.monto ? true : undefined}
                  aria-describedby={errores.monto ? id("recibido-error") : id("vuelto")}
                  onChange={(e) => {
                    setRecibido(e.target.value);
                    limpiarError("monto");
                  }}
                  onKeyDown={alPulsarEnter}
                />
                {errores.monto ? (
                  <p id={id("recibido-error")} className="text-sm text-destructive-text">
                    {errores.monto}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Para calcular el vuelto.</p>
                )}
              </div>
              <div
                id={id("vuelto")}
                aria-live="polite"
                className="flex flex-col gap-1 self-start rounded-md border border-border bg-card p-4"
              >
                <p className="text-xs font-medium text-muted-foreground">Vuelto</p>
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
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Cuenta que recibió el pago</p>
                {cuentasDelTipo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin cuentas de {NOMBRE_METODO[opcionActual.tipo]} activas: se registra sin cuenta.
                  </p>
                ) : (
                  <GrupoOpciones etiqueta="Cuenta que recibió el pago" className="grid gap-2 sm:grid-cols-2">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={id("referencia")}>
                    {opcionActual.tipo === "ZELLE" ? "Código de confirmación" : "Número de referencia"}
                  </Label>
                  <Input
                    id={id("referencia")}
                    autoComplete="off"
                    inputMode={opcionActual.tipo === "ZELLE" ? "text" : "numeric"}
                    className="font-mono"
                    value={referencia}
                    disabled={disabled || enviando}
                    aria-invalid={errores.referencia ? true : undefined}
                    aria-describedby={errores.referencia ? id("referencia-error") : undefined}
                    onChange={(e) => {
                      setReferencia(e.target.value);
                      limpiarError("referencia");
                    }}
                    onKeyDown={alPulsarEnter}
                  />
                  {errores.referencia && (
                    <p id={id("referencia-error")} className="text-sm text-destructive-text">
                      {errores.referencia}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={id("fecha")}>Fecha del pago</Label>
                  <Input
                    id={id("fecha")}
                    type="date"
                    value={fecha}
                    max={hoyVE()}
                    disabled={disabled || enviando}
                    aria-invalid={errores.fecha ? true : undefined}
                    aria-describedby={errores.fecha ? id("fecha-error") : undefined}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      limpiarError("fecha");
                    }}
                  />
                  {errores.fecha && (
                    <p id={id("fecha-error")} className="text-sm text-destructive-text">
                      {errores.fecha}
                    </p>
                  )}
                </div>
                {opcionActual.tipo !== "ZELLE" && (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor={id("banco")}>Banco del cliente</Label>
                    <Input
                      id={id("banco")}
                      list={id("bancos")}
                      autoComplete="off"
                      placeholder="Ej.: 0134 · Banesco"
                      value={banco}
                      disabled={disabled || enviando}
                      aria-invalid={errores.banco ? true : undefined}
                      aria-describedby={errores.banco ? id("banco-error") : undefined}
                      onChange={(e) => {
                        setBanco(e.target.value);
                        limpiarError("banco");
                      }}
                    />
                    <datalist id={id("bancos")}>
                      {OPCIONES_BANCO.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                    {errores.banco && (
                      <p id={id("banco-error")} className="text-sm text-destructive-text">
                        {errores.banco}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Regístralo cuando ya lo veas en la cuenta.</p>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={pedirConfirmacion} disabled={disabled || enviando || !tasa}>
              Cobrar {totalTexto}
            </Button>
          </div>
        </div>
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

// ─── Modal de cobro en la taquilla de origen ────────────────────────────────

interface PagoModalProps {
  encomienda: Encomienda;
  isOpen: boolean;
  onClose: () => void;
  /** El cobro quedó registrado o aprobado. */
  onSuccess: (encomiendaId: string) => void;
}

export function PagoModal({ encomienda, isOpen, onClose, onSuccess }: PagoModalProps) {
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cobro, setCobro] = useState<EstadoCobroEncomienda | null>(null);
  const peticionRef = useRef(0);
  // VerificarPagoDialog llama onResuelto y justo después onOpenChange(false): ese
  // cierre no debe cerrar este modal (aprobado → foto; rechazado → cobrar de nuevo).
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
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga asíncrona al abrir
    void cargar();
    const peticiones = peticionRef;
    return () => {
      peticiones.current++;
    };
  }, [isOpen, cargar]);

  const cerrar = () => onClose();

  const modalidad =
    encomienda.modalidad_pago === "DESTINO"
      ? `${MODALIDAD_PAGO.DESTINO.largo}. Quien envía puede pagar ahora.`
      : `${MODALIDAD_PAGO.ORIGEN.largo}.`;

  let cuerpo: React.ReactNode;
  if (cargando && !cobro) {
    cuerpo = (
      <div className="flex flex-col gap-4" role="status" aria-label="Revisando si el cliente ya reportó un pago">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-9 w-full rounded-full" />
      </div>
    );
  } else if (errorCarga && !cobro) {
    cuerpo = (
      <ErrorState compacto titulo="No pudimos revisar el pago" descripcion={errorCarga} onReintentar={cargar} />
    );
  } else if (cobro?.aprobado) {
    cuerpo = (
      <p role="status" className="flex items-start gap-2 rounded-md border border-success/40 bg-success-light p-3 text-sm text-success-deep">
        <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
        Ya está pagada.
      </p>
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
          cerrar();
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
          <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
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
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent tamano="flujo">
        <DialogHeader>
          <DialogTitle>Cobrar encomienda</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{encomienda.tracking_id}</span> · {formatCiudad(encomienda.ciudad_origen)} →{" "}
            {formatCiudad(encomienda.ciudad_destino)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section aria-label="Resumen" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-muted/50 p-4 text-sm">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Remitente</p>
              <p className="truncate font-medium">{remitenteDe(encomienda).nombre}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Destinatario</p>
              <p className="truncate font-medium">{encomienda.receiver_nombre}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Peso</p>
              <p className="font-medium tabular-nums">
                {encomienda.peso_kg ? `${String(encomienda.peso_kg).replace(".", ",")} kg` : "Por pesar"}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Total a cobrar</p>
              <Monto usd={encomienda.costo_calculado} size="md" />
            </div>
            <p className="col-span-2 text-muted-foreground">{modalidad}</p>
          </section>

          {cuerpo}
        </div>
      </DialogContent>
    </Dialog>
  );
}
