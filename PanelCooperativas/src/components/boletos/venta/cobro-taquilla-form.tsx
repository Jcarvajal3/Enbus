"use client";

// ─── Cobro en taquilla: "¿Cómo pagó?" ────────────────────────────────────────
// Efectivo Bs / USD (con vuelto, monto exacto y billetes), punto de venta, Pago
// Móvil, transferencia y Zelle (con cuenta receptora, referencia, fecha de los
// últimos 30 días y banco). Lo usan la venta nueva y el cobro de una reserva de la
// app. El formulario NO dibuja su botón: lo pone la página en su `BarraFlujo`
// (`type: "submit"`, `form: ID_FORM_COBRO`) con el texto que este formulario
// informa por `onEtiqueta` ("Cobrar Bs 2.500,00").

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BankIcon,
  CheckCircleIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  DeviceMobileIcon,
  MoneyIcon,
  type Icon,
} from "@phosphor-icons/react";
import { BancoField, Campo, FechaField, MontoField } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvisoError } from "@/components/aviso-error";
import { Monto } from "@/components/monto";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { formatBs, formatNumeroVE, formatUsd, leerMonto, usdABs } from "@/lib/dinero";
import { hoyVE, sumarDiasVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import type { TipoMetodoPago } from "@/lib/types/pagos";
import type { DatosPagoTaquilla, ResultadoTaquilla } from "../../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { BotonAlternarDisenoCobro, useDisenoCobro } from "./cobro-ab";

export const ID_FORM_COBRO = "venta-cobro";

type MetodoCobro = "EFECTIVO_VES" | "EFECTIVO_USD" | "PUNTO_DE_VENTA" | "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

// Iconos de §2.3: Money efectivo, CreditCard punto de venta, DeviceMobile Pago Móvil, Bank Transferencia,
// CurrencyDollar Zelle. Primero los presenciales (efectivo y punto de venta): siempre disponibles.
const METODOS: { id: MetodoCobro; titulo: string; Icono: Icon }[] = [
  { id: "EFECTIVO_VES", titulo: "Efectivo Bs", Icono: MoneyIcon },
  { id: "EFECTIVO_USD", titulo: "Efectivo USD", Icono: MoneyIcon },
  { id: "PUNTO_DE_VENTA", titulo: "Punto de venta", Icono: CreditCardIcon },
  { id: "PAGO_MOVIL", titulo: "Pago Móvil", Icono: DeviceMobileIcon },
  { id: "TRANSFERENCIA_BANCARIA", titulo: "Transferencia", Icono: BankIcon },
  { id: "ZELLE", titulo: "Zelle", Icono: CurrencyDollarIcon },
];

/** Métodos con cuenta de la cooperativa (efectivo y punto de venta no la tienen). */
type TipoConCuenta = Exclude<TipoMetodoPago, "EFECTIVO" | "PUNTO_DE_VENTA">;

const NOMBRE_TIPO: Record<TipoConCuenta, string> = {
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "transferencia",
  ZELLE: "Zelle",
};

type CuentaCooperativa = {
  id: string;
  tipo: TipoMetodoPago;
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  email_zelle: string | null;
};

function etiquetaCuenta(c: CuentaCooperativa) {
  if (c.tipo === "ZELLE") return `${c.email_zelle ?? "Zelle"} (${c.titular})`;
  const final = (c.numero_cuenta ?? "").replace(/\D/g, "").slice(-4);
  return `${c.banco ?? "Cuenta"}${final ? ` ••••${final}` : ""} (${c.titular})`;
}

/** Error de un campo del cobro, devuelto por el servidor (`details.campo`). */
export type ErrorCampoCobro = { campo: "monto" | "referencia" | "banco" | "fecha" | null; mensaje: string };

/** Traduce un error del cobro (EB_*) al campo afectado del formulario. */
export function errorDeCobro(res: Extract<ResultadoTaquilla<unknown>, { success: false }>): ErrorCampoCobro | null {
  const campo = res.detalle?.campo;
  if (res.codigo === "EB_MONTO_INSUFICIENTE") {
    const esperado = typeof res.detalle?.esperado === "number" ? res.detalle.esperado : Number(res.detalle?.esperado);
    const moneda = res.detalle?.moneda === "USD" ? "USD" : "VES";
    return {
      campo: "monto",
      mensaje: Number.isFinite(esperado)
        ? `El total a cobrar es ${moneda === "USD" ? formatUsd(esperado) : formatBs(esperado)}. El monto recibido no alcanza.`
        : res.error,
    };
  }
  if (campo === "monto" || campo === "referencia" || campo === "banco" || campo === "fecha") {
    return { campo, mensaje: res.error };
  }
  if (res.codigo === "EB_DATOS_PAGO_INVALIDOS" || res.codigo === "EB_METODO_INVALIDO") {
    return { campo: null, mensaje: res.error };
  }
  return null;
}

type CobroFormProps = {
  /** Total USD de referencia (precio × asientos). */
  totalUsd: number;
  enviando: boolean;
  errorCampo?: ErrorCampoCobro | null;
  onCobrar: (datos: DatosPagoTaquilla) => void;
  /** Texto del botón de la página ("Cobrar Bs 2.500,00"), que depende del método elegido. */
  onEtiqueta?: (texto: string) => void;
};

export function CobroTaquillaForm({ totalUsd, enviando, errorCampo, onCobrar, onEtiqueta }: CobroFormProps) {
  const { user } = useUser();
  const cooperativaId = user?.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);
  const tasa = useTasaBCV();
  const ids = useId();
  const { diseno, alternar, esLateral } = useDisenoCobro();

  const [metodo, setMetodo] = useState<MetodoCobro>("EFECTIVO_VES");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [cuentas, setCuentas] = useState<CuentaCooperativa[]>([]);
  const [errorCuentas, setErrorCuentas] = useState(false);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyVE());
  const [banco, setBanco] = useState("");
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!cooperativaId) return;
    let activo = true;
    void (async () => {
      const { data, error } = await supabase
        .from("metodos_pago_cooperativa")
        .select("id, tipo, banco, titular, numero_cuenta, email_zelle")
        .eq("cooperativa_id", cooperativaId)
        .eq("activo", true)
        .order("created_at", { ascending: true });
      if (!activo) return;
      if (error) {
        setErrorCuentas(true);
        return;
      }
      setErrorCuentas(false);
      setCuentas((data ?? []) as CuentaCooperativa[]);
    })();
    return () => {
      activo = false;
    };
  }, [supabase, cooperativaId]);

  const efectivo = metodo === "EFECTIVO_VES" || metodo === "EFECTIVO_USD";
  // Punto de venta: solo referencia del comprobante y fecha (sin cuenta, banco ni vuelto).
  const puntoVenta = metodo === "PUNTO_DE_VENTA";
  const enUsd = metodo === "EFECTIVO_USD" || metodo === "ZELLE";
  const tipo: TipoMetodoPago = efectivo ? "EFECTIVO" : (metodo as TipoMetodoPago);
  const cuentasTipo = useMemo(() => cuentas.filter((c) => c.tipo === tipo), [cuentas, tipo]);
  const cuentaElegida = cuentasTipo.find((c) => c.id === cuentaId) ?? (cuentasTipo.length === 1 ? cuentasTipo[0] : null);

  const totalBs = tasa ? usdABs(totalUsd, tasa.tasa) : null;
  const esperado = enUsd ? totalUsd : totalBs;
  const recibido = leerMonto(recibidoTexto);
  const diferencia = efectivo && recibido !== null && esperado !== null ? Math.round((recibido - esperado) * 100) / 100 : null;
  const fmt = (n: number) => (enUsd ? formatUsd(n) : formatBs(n));

  const refLimpia = referencia.toUpperCase().replace(/[\s._/-]/g, "");
  const refValida = metodo === "ZELLE" ? /^[A-Z0-9]{4,40}$/.test(refLimpia) : /^\d{4,30}$/.test(refLimpia);
  const hoy = hoyVE();
  const minFecha = sumarDiasVE(hoy, -30);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy && fecha >= minFecha;

  const errores = {
    monto:
      efectivo && (recibido === null || (esperado !== null && recibido < esperado))
        ? recibido === null
          ? "Escribe cuánto te entregó el pasajero."
          : `Faltan ${fmt(Math.abs(diferencia ?? 0))}. El total es ${fmt(esperado ?? 0)}.`
        : null,
    cuenta: !efectivo && !puntoVenta && cuentasTipo.length > 1 && !cuentaElegida ? "Elige la cuenta que recibió el pago." : null,
    referencia: !efectivo && !refValida
      ? metodo === "ZELLE"
        ? "Escribe el código de confirmación de Zelle (mínimo 4 caracteres)."
        : puntoVenta
          ? "Escribe la referencia del comprobante del punto: solo números, mínimo 4."
          : "Escribe la referencia completa: solo números, mínimo 4."
      : null,
    banco: !efectivo && !puntoVenta && metodo !== "ZELLE" && !banco.trim() ? "Elige el banco desde el que pagó el pasajero." : null,
    fecha: !efectivo && !fechaValida ? "La fecha del pago debe estar entre hoy y los últimos 30 días." : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);

  // Error del servidor en un campo: gana sobre la validación local hasta que se edite algo.
  const [errorPrevio, setErrorPrevio] = useState(errorCampo);
  const [errorActivo, setErrorActivo] = useState(errorCampo);
  if (errorCampo !== errorPrevio) {
    setErrorPrevio(errorCampo);
    setErrorActivo(errorCampo);
  }
  const errorServidor = (campo: Exclude<ErrorCampoCobro["campo"], null>) =>
    errorActivo && errorActivo.campo === campo ? errorActivo.mensaje : null;
  const mostrar = (campo: keyof typeof errores, campoServidor?: Exclude<ErrorCampoCobro["campo"], null>) =>
    (campoServidor ? errorServidor(campoServidor) : null) ?? (intentado ? errores[campo] : null);
  const editar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      if (errorActivo) setErrorActivo(null);
    };

  useEffect(() => {
    if (errorCampo?.campo === "monto") document.getElementById(`${ids}-recibido`)?.focus();
    if (errorCampo?.campo === "referencia") document.getElementById(`${ids}-ref`)?.focus();
  }, [errorCampo, ids]);

  const cambiarMetodo = (m: MetodoCobro) => {
    setMetodo(m);
    setRecibidoTexto("");
    setCuentaId("");
    setIntentado(false);
    setErrorActivo(null);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!tasa || enviando) return;
    if (hayErrores) {
      // Al primer campo con error (el orden de la pantalla).
      const primero = errores.monto
        ? "recibido"
        : errores.referencia
          ? "ref"
          : errores.fecha
            ? "fecha"
            : errores.banco
              ? "banco"
              : errores.cuenta
                ? "cuenta"
                : null;
      if (primero) document.getElementById(`${ids}-${primero}`)?.focus();
      return;
    }
    onCobrar({
      metodoTipo: tipo,
      metodoPagoId: efectivo || puntoVenta ? null : (cuentaElegida?.id ?? null),
      moneda: efectivo ? (metodo === "EFECTIVO_USD" ? "USD" : "VES") : null,
      montoRecibido: efectivo ? recibido : null,
      referencia: efectivo ? null : refLimpia,
      fecha: efectivo ? null : fecha,
      banco: efectivo || puntoVenta || metodo === "ZELLE" ? null : banco.trim(),
    });
  };

  const textoCobrar = `Cobrar ${enUsd ? formatUsd(totalUsd) : tasa ? formatBs(totalBs ?? 0) : formatUsd(totalUsd)}`;
  const onEtiquetaRef = useRef(onEtiqueta);
  useEffect(() => {
    onEtiquetaRef.current = onEtiqueta;
  });
  useEffect(() => {
    onEtiquetaRef.current?.(textoCobrar);
  }, [textoCobrar]);

  const errorMonto = mostrar("monto", "monto");
  const errorReferencia = mostrar("referencia", "referencia");
  const errorFecha = mostrar("fecha", "fecha");
  const errorBanco = mostrar("banco", "banco");
  const errorCuenta = mostrar("cuenta");

  const detallesCobro = efectivo ? (
    <div className={cn("grid gap-4", !esLateral && "md:grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-2">
        <MontoField
          id={`${ids}-recibido`}
          label="Monto recibido"
          moneda={enUsd ? "USD" : "Bs"}
          value={recibidoTexto}
          onChange={editar(setRecibidoTexto)}
          error={errorMonto}
          ayuda="Para calcular el vuelto."
          placeholder={esperado !== null ? `Ej. ${formatNumeroVE(esperado)}` : undefined}
          enterKeyHint="done"
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          {esperado !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11 max-md:px-4"
              onClick={() => editar(setRecibidoTexto)(formatNumeroVE(esperado))}
            >
              Monto exacto
            </Button>
          )}
          {enUsd &&
            [5, 10, 20, 50, 100]
              .filter((b) => esperado !== null && b >= esperado)
              .slice(0, 3)
              .map((b) => (
                <Button
                  key={b}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-md:h-11 max-md:px-4"
                  onClick={() => editar(setRecibidoTexto)(formatNumeroVE(b))}
                >
                  USD {b}
                </Button>
              ))}
        </div>
      </div>
      <div
        className="flex min-w-0 flex-col gap-1 self-start rounded-md border border-transparent bg-surface p-4 dark:border-border-strong/35"
        aria-live="polite"
      >
        <p className="text-[13px] font-medium text-muted-foreground">Vuelto</p>
        <p
          className={cn(
            "leading-tight font-semibold tracking-tight tabular-nums",
            esLateral ? "text-[24px] sm:text-[28px]" : "text-[28px]",
            diferencia !== null && diferencia < 0 && "text-destructive-text"
          )}
        >
          {diferencia === null ? "—" : diferencia < 0 ? `Faltan ${fmt(-diferencia)}` : fmt(diferencia)}
        </p>
      </div>
    </div>
  ) : (
    <div className="grid min-w-0 gap-4">
      {tasa && (
        <p className="text-[15px] text-muted-foreground">
          {puntoVenta ? "Confirma que el punto de venta aprobó " : "Confirma que llegaron "}
          <strong className="font-semibold text-foreground">{metodo === "ZELLE" ? formatUsd(totalUsd) : formatBs(totalBs ?? 0)}</strong>.
        </p>
      )}

      {!puntoVenta && (
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${ids}-cuenta`}>Cuenta que recibió el pago</Label>
          {cuentasTipo.length === 0 ? (
            <p id={`${ids}-cuenta`} className="text-[13px] text-muted-foreground">
              {errorCuentas
                ? "No pudimos cargar las cuentas: el pago se registra sin cuenta."
                : `Sin cuentas de ${NOMBRE_TIPO[tipo as TipoConCuenta]} activas: se registra sin cuenta.`}
            </p>
          ) : (
            <Select
              value={cuentaElegida?.id ?? ""}
              onValueChange={(v) => editar(setCuentaId)(v ?? "")}
              items={Object.fromEntries(cuentasTipo.map((c) => [c.id, etiquetaCuenta(c)]))}
            >
              <SelectTrigger id={`${ids}-cuenta`} className="w-full" aria-invalid={errorCuenta ? true : undefined}>
                <SelectValue placeholder="Elige la cuenta" />
              </SelectTrigger>
              <SelectContent>
                {cuentasTipo.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {etiquetaCuenta(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errorCuenta && (
            <p role="alert" className="text-[13px] text-destructive-text">
              {errorCuenta}
            </p>
          )}
        </div>
      )}

      <div className={cn("grid min-w-0 gap-4", !esLateral && "md:grid-cols-2")}>
        <Campo
          id={`${ids}-ref`}
          label={metodo === "ZELLE" ? "Código de confirmación" : puntoVenta ? "Referencia del comprobante" : "Número de referencia"}
          value={referencia}
          onChange={editar(setReferencia)}
          error={errorReferencia}
          inputMode={metodo === "ZELLE" ? "text" : "numeric"}
          mayusculas={metodo === "ZELLE"}
          maxLength={40}
          autoFocus
        />
        <FechaField
          id={`${ids}-fecha`}
          label="Fecha del pago"
          value={fecha}
          onChange={editar(setFecha)}
          min={minFecha}
          max={hoy}
          error={errorFecha}
          ayuda="Entre hoy y los últimos 30 días."
        />
      </div>

      {metodo !== "ZELLE" && !puntoVenta && (
        <BancoField
          id={`${ids}-banco`}
          label="Banco del pasajero"
          value={banco}
          onChange={editar(setBanco)}
          error={errorBanco}
        />
      )}
    </div>
  );

  return (
    <>
      <form id={ID_FORM_COBRO} onSubmit={enviar} className="flex flex-col gap-5" noValidate>
        {esLateral ? (
          // Diseño B (A/B testing): Total + detalles a la izquierda; riel vertical de métodos a la derecha.
          <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] items-start gap-2.5 sm:grid-cols-[minmax(0,1fr)_7.5rem] sm:gap-4 md:grid-cols-[minmax(0,1fr)_9.25rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <section
                aria-label="Total a cobrar"
                className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl border border-transparent bg-surface px-3.5 py-3 dark:border-border-strong/35 sm:px-4 sm:py-3.5"
              >
                <span className="text-[13px] font-semibold text-muted-foreground">Total</span>
                <Monto usd={totalUsd} moneda={enUsd ? "USD" : undefined} size="md" align="right" />
              </section>
              {!tasa && <AvisoError>Sin tasa BCV de hoy: no se puede cobrar.</AvisoError>}
              {detallesCobro}
              {errorActivo && errorActivo.campo === null && <AvisoError>{errorActivo.mensaje}</AvisoError>}
            </div>

            <aside aria-label="Métodos de pago" className="sticky top-4 min-w-0">
              <GrupoOpciones etiqueta="¿Cómo pagó?" className="flex flex-col gap-2">
                {METODOS.map(({ id, titulo, Icono }) => {
                  const seleccionado = metodo === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={seleccionado}
                      onClick={() => {
                        if (!seleccionado) cambiarMetodo(id);
                      }}
                      className={cn(
                        "relative flex min-h-[58px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-transparent bg-surface px-1.5 py-2 text-center text-foreground transition-colors outline-none sm:min-h-[64px] sm:gap-1.5 sm:px-2.5 sm:py-2.5",
                        "hover:bg-surface-dark dark:border-border-strong/35",
                        "focus-visible:ring-[3px] focus-visible:ring-accent-strong/30",
                        seleccionado &&
                          "border-accent-strong bg-card shadow-card hover:bg-card dark:border-accent-strong"
                      )}
                    >
                      {seleccionado && (
                        <CheckCircleIcon
                          weight="fill"
                          aria-hidden
                          className="absolute top-1.5 right-1.5 size-3.5 text-accent-strong sm:top-2 sm:right-2 sm:size-4"
                        />
                      )}
                      <Icono
                        className={cn(
                          "size-5 shrink-0 sm:size-6",
                          seleccionado ? "text-accent-strong" : "text-muted-foreground"
                        )}
                        weight="fill"
                        aria-hidden
                      />
                      <span className="w-full text-[11px] leading-tight font-semibold sm:text-[13px]">{titulo}</span>
                    </button>
                  );
                })}
              </GrupoOpciones>
            </aside>
          </div>
        ) : (
          // Diseño A (A/B testing): diagramación clásica vertical.
          <>
            <section
              aria-label="Total a cobrar"
              className="flex flex-col gap-1 rounded-md border border-transparent bg-surface p-5 dark:border-border-strong/35"
            >
              <p className="text-[13px] font-medium text-muted-foreground">Total a cobrar</p>
              <Monto usd={totalUsd} moneda={enUsd ? "USD" : undefined} size="xl" />
            </section>
            {!tasa && <AvisoError>Sin tasa BCV de hoy: no se puede cobrar.</AvisoError>}

            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-foreground">¿Cómo pagó?</p>
              <GrupoOpciones etiqueta="¿Cómo pagó?" className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {METODOS.map(({ id, titulo, Icono }) => (
                  <OpcionTile
                    key={id}
                    seleccionado={metodo === id}
                    onSelect={() => cambiarMetodo(id)}
                    icono={Icono}
                    titulo={titulo}
                    className="items-center px-2 text-center"
                  />
                ))}
              </GrupoOpciones>
            </div>

            {detallesCobro}

            {errorActivo && errorActivo.campo === null && <AvisoError>{errorActivo.mensaje}</AvisoError>}
          </>
        )}
      </form>
      <BotonAlternarDisenoCobro diseno={diseno} onAlternar={alternar} />
    </>
  );
}
