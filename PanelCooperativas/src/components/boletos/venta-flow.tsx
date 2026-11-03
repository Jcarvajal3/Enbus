"use client";

// ─── Venta de boletos en taquilla ───────────────────────────────────────────
// Viaje → asientos (uno o varios) → datos de cada pasajero → cobro → boletos.
// El cobro se hace en bolívares a la tasa BCV del día (o en dólares en efectivo
// o Zelle). La venta y el pago se registran juntos con `fn_vender_boletos_taquilla`
// y una clave de idempotencia creada al abrir el flujo: reintentar no duplica.
//
// Este módulo también exporta el formulario de cobro y el diálogo para cobrar
// en taquilla una reserva hecha desde la app (`CobrarReservaDialog`).

import { useState, useEffect, useMemo, useCallback, useRef, useId, lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-user";
import {
  MapPin, Clock, Users, ArrowRight, Check, Printer, Money, CurrencyDollar,
  DeviceMobile, Bank, PaperPlaneTilt, Warning, ArrowClockwise,
} from "@phosphor-icons/react";
import { SeatSelector, listaAsientos } from "./seat-selector";
import { Monto } from "@/components/monto";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import {
  venderBoletos,
  cobrarReserva,
  type DatosPagoTaquilla,
  type OperacionTaquilla,
  type ResultadoTaquilla,
} from "../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { printBoleto, imprimirHtml, MSG_VENTANA_BLOQUEADA } from "@/lib/printing/print-helpers";
import { OPCIONES_BANCO } from "@/lib/bancos";
import { cedulaParaGuardar, cedulaValida } from "@/lib/ve";
import { printer } from "@/lib/printing/bluetooth";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd, usdABs } from "@/lib/dinero";
import { formatFechaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { formatSalidaCorta, type TipoMetodoPago } from "@/lib/types/pagos";
import type { Boleto } from "@/lib/types/boletos";
import { cn } from "@/lib/utils";
import { formatCiudad } from "@/lib/ciudades";

// Lazy-load QR code renderer (~40KB) — only needed in confirmation step
const QRCodeSVG = lazy(() => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })));

type VentaStep = "viaje" | "asiento" | "pasajero" | "pago" | "confirmacion";

const PASOS: { id: VentaStep; titulo: string }[] = [
  { id: "viaje", titulo: "Viaje" },
  { id: "asiento", titulo: "Asientos" },
  { id: "pasajero", titulo: "Pasajeros" },
  { id: "pago", titulo: "Cobro" },
  { id: "confirmacion", titulo: "Boletos" },
];

export interface ViajeParaVenta {
  id: string;
  fecha_hora_salida: string;
  fecha_hora_llegada_est: string;
  asientos_totales: number;
  asientos_disponibles: number;
  estado: string;
  numero_unidad: string;
  ruta: {
    ciudad_origen: string;
    estado_origen: string;
    ciudad_destino: string;
    estado_destino: string;
    precio_pasaje: number;
  };
}

type DatosPasajero = { nombre: string; cedula: string; telefono: string };

const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

/** Error inesperado (red, servidor) en texto para el usuario, nunca el mensaje técnico. */
function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

/** Clave de idempotencia de una operación (una por flujo abierto). */
function nuevaClave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** "sáb 04/10 · 08:00" en hora de Venezuela. */
export function formatSalidaVenta(iso: string) {
  const dia = formatFechaVE(iso, { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "");
  const hora = formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return dia && hora ? `${dia} · ${hora}` : formatSalidaCorta(iso);
}

/** "3.024,50" / "3024,5" / "3024.5" / "3.024" -> número (null si no es un número válido). */
function parseMonto(valor: string): number | null {
  let t = valor.trim().replace(/\s/g, "").replace(/^(bs\.?|usd|\$)/i, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // Varios puntos, o uno solo seguido de exactamente 3 dígitos ("3.024"): separador de miles.
  else if ((t.match(/\./g) ?? []).length > 1 || /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Cédula como se guarda ("V-12345678"); si no es válida, tal cual. */
function formatearCedula(cedula: string) {
  return cedulaParaGuardar(cedula) ?? cedula.trim();
}

// ─── Formulario de cobro en taquilla ────────────────────────────────────────

type MetodoCobro = "EFECTIVO_VES" | "EFECTIVO_USD" | "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

const METODOS: { id: MetodoCobro; titulo: string; Icono: typeof Money }[] = [
  { id: "EFECTIVO_VES", titulo: "Efectivo Bs", Icono: Money },
  { id: "EFECTIVO_USD", titulo: "Efectivo USD", Icono: CurrencyDollar },
  { id: "PAGO_MOVIL", titulo: "Pago Móvil", Icono: DeviceMobile },
  { id: "TRANSFERENCIA_BANCARIA", titulo: "Transferencia", Icono: Bank },
  { id: "ZELLE", titulo: "Zelle", Icono: PaperPlaneTilt },
];

const NOMBRE_TIPO: Record<Exclude<TipoMetodoPago, "EFECTIVO">, string> = {
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

type CobroFormProps = {
  /** Total USD de referencia (precio × asientos). */
  totalUsd: number;
  enviando: boolean;
  errorCampo?: ErrorCampoCobro | null;
  onCobrar: (datos: DatosPagoTaquilla) => void;
  onVolver?: () => void;
  textoVolver?: string;
};

export function CobroTaquillaForm({ totalUsd, enviando, errorCampo, onCobrar, onVolver, textoVolver = "Volver" }: CobroFormProps) {
  const { user } = useUser();
  const cooperativaId = user?.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);
  const tasa = useTasaBCV();
  const ids = useId();

  const [metodo, setMetodo] = useState<MetodoCobro>("EFECTIVO_VES");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [cuentas, setCuentas] = useState<CuentaCooperativa[]>([]);
  const [errorCuentas, setErrorCuentas] = useState(false);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyVE());
  const [banco, setBanco] = useState("");
  const [intentado, setIntentado] = useState(false);
  const recibidoRef = useRef<HTMLInputElement>(null);
  const referenciaRef = useRef<HTMLInputElement>(null);

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
        console.error("Error cargando cuentas de la cooperativa:", error);
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
  const enUsd = metodo === "EFECTIVO_USD" || metodo === "ZELLE";
  const tipo: TipoMetodoPago = efectivo ? "EFECTIVO" : (metodo as TipoMetodoPago);
  const cuentasTipo = useMemo(() => cuentas.filter((c) => c.tipo === tipo), [cuentas, tipo]);
  const cuentaElegida = cuentasTipo.find((c) => c.id === cuentaId) ?? (cuentasTipo.length === 1 ? cuentasTipo[0] : null);

  const totalBs = tasa ? usdABs(totalUsd, tasa.tasa) : null;
  const esperado = enUsd ? totalUsd : totalBs;
  const recibido = parseMonto(recibidoTexto);
  const diferencia = efectivo && recibido !== null && esperado !== null ? Math.round((recibido - esperado) * 100) / 100 : null;
  const fmt = (n: number) => (enUsd ? formatUsd(n) : formatBs(n));

  const refLimpia = referencia.toUpperCase().replace(/[\s._/-]/g, "");
  const refValida = metodo === "ZELLE" ? /^[A-Z0-9]{4,40}$/.test(refLimpia) : /^\d{4,30}$/.test(refLimpia);
  const hoy = hoyVE();
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy && fecha >= sumarDiasVE(hoy, -30);

  const errores = {
    monto: efectivo && (recibido === null || (esperado !== null && recibido < esperado))
      ? recibido === null
        ? "Escribe cuánto te entregó el pasajero."
        : `Faltan ${fmt(Math.abs(diferencia ?? 0))}. El total es ${fmt(esperado ?? 0)}.`
      : null,
    cuenta: !efectivo && cuentasTipo.length > 1 && !cuentaElegida ? "Elige la cuenta que recibió el pago." : null,
    referencia: !efectivo && !refValida
      ? metodo === "ZELLE"
        ? "Escribe el código de confirmación de Zelle (mínimo 4 caracteres)."
        : "Escribe la referencia completa: solo números, mínimo 4."
      : null,
    banco: !efectivo && metodo !== "ZELLE" && !banco ? "Elige el banco desde el que pagó el pasajero." : null,
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
  const editar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    if (errorActivo) setErrorActivo(null);
  };

  useEffect(() => {
    if (errorCampo?.campo === "monto") recibidoRef.current?.focus();
    if (errorCampo?.campo === "referencia") referenciaRef.current?.focus();
  }, [errorCampo]);

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
    if (!tasa || hayErrores || enviando) return;
    onCobrar({
      metodoTipo: tipo,
      metodoPagoId: efectivo ? null : cuentaElegida?.id ?? null,
      moneda: efectivo ? (metodo === "EFECTIVO_USD" ? "USD" : "VES") : null,
      montoRecibido: efectivo ? recibido : null,
      referencia: efectivo ? null : refLimpia,
      fecha: efectivo ? null : fecha,
      banco: efectivo || metodo === "ZELLE" ? null : banco,
    });
  };

  const textoCobrar = !tasa
    ? `Cobrar ${formatUsd(totalUsd)}`
    : enUsd
      ? `Cobrar ${formatUsd(totalUsd)} (${formatBs(totalBs ?? 0)} · BCV ${fechaTasaCorta(tasa.fecha)})`
      : `Cobrar ${formatBs(totalBs ?? 0)} (${formatUsd(totalUsd)} · BCV ${fechaTasaCorta(tasa.fecha)})`;

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <section aria-label="Total a cobrar" className="rounded-2xl bg-muted/50 p-4">
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Total a cobrar</p>
        <Monto usd={totalUsd} moneda={enUsd ? "USD" : undefined} size="lg" />
        {!tasa && (
          <p className="mt-2 flex items-start gap-2 text-sm text-destructive-text" role="alert">
            <Warning weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
            No hay tasa BCV registrada hoy, así que no se puede cobrar. Pídele al administrador que la cargue en Tarifas.
          </p>
        )}
      </section>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">¿Cómo pagó el pasajero?</legend>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="radiogroup">
          {METODOS.map(({ id, titulo, Icono }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={metodo === id}
              onClick={() => cambiarMetodo(id)}
              className={cn(
                "flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 bg-muted/40 px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                metodo === id ? "border-primary bg-primary/5 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              <Icono className="size-6" aria-hidden />
              {titulo}
            </button>
          ))}
        </div>
      </fieldset>

      {efectivo ? (
        <div className="grid gap-4 rounded-xl bg-muted/30 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${ids}-recibido`}>Monto recibido ({enUsd ? "USD" : "Bs"})</Label>
            <Input
              id={`${ids}-recibido`}
              ref={recibidoRef}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder={esperado !== null ? `Ej. ${formatNumeroVE(esperado)}` : ""}
              value={recibidoTexto}
              aria-invalid={mostrar("monto", "monto") ? true : undefined}
              aria-describedby={`${ids}-recibido-ayuda`}
              onChange={(e) => editar(setRecibidoTexto)(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {esperado !== null && (
                <Button type="button" variant="outline" size="xs" onClick={() => editar(setRecibidoTexto)(formatNumeroVE(esperado))}>
                  Monto exacto
                </Button>
              )}
              {enUsd &&
                [5, 10, 20, 50, 100]
                  .filter((b) => esperado !== null && b >= esperado)
                  .slice(0, 3)
                  .map((b) => (
                    <Button key={b} type="button" variant="outline" size="xs" onClick={() => editar(setRecibidoTexto)(String(b))}>
                      USD {b}
                    </Button>
                  ))}
            </div>
            <p id={`${ids}-recibido-ayuda`} className={cn("text-sm", mostrar("monto", "monto") ? "text-destructive-text" : "text-muted-foreground")}>
              {mostrar("monto", "monto") ?? "Escribe lo que te entregó el pasajero para calcular el vuelto."}
            </p>
          </div>
          <div className="space-y-1 rounded-xl border bg-background p-3" aria-live="polite">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Vuelto</p>
            <p className={cn("text-2xl font-semibold tabular-nums", diferencia !== null && diferencia < 0 && "text-destructive-text")}>
              {diferencia === null ? "—" : diferencia < 0 ? `Faltan ${fmt(-diferencia)}` : fmt(diferencia)}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 rounded-xl bg-muted/30 p-4">
          {metodo !== "ZELLE" && tasa && (
            <p className="text-sm text-muted-foreground">
              Confirma en tu banco que llegaron <strong className="text-foreground">{formatBs(totalBs ?? 0)}</strong> antes de cobrar.
            </p>
          )}
          {metodo === "ZELLE" && (
            <p className="text-sm text-muted-foreground">
              Confirma en tu correo de Zelle que llegaron <strong className="text-foreground">{formatUsd(totalUsd)}</strong> antes de cobrar.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${ids}-cuenta`}>Cuenta que recibió el pago</Label>
            {cuentasTipo.length === 0 ? (
              <p id={`${ids}-cuenta`} className="text-sm text-muted-foreground">
                {errorCuentas
                  ? "No pudimos cargar las cuentas de tu cooperativa. El pago se registrará sin cuenta; si necesitas indicarla, cierra y vuelve a abrir el cobro."
                  : `Tu cooperativa no tiene cuentas de ${NOMBRE_TIPO[tipo as Exclude<TipoMetodoPago, "EFECTIVO">]} activas en Configuración. El pago se registrará sin cuenta.`}
              </p>
            ) : (
              <Select
                value={cuentaElegida?.id ?? ""}
                onValueChange={(v) => editar(setCuentaId)(v ?? "")}
                items={Object.fromEntries(cuentasTipo.map((c) => [c.id, etiquetaCuenta(c)]))}
              >
                <SelectTrigger id={`${ids}-cuenta`} className="w-full" aria-invalid={mostrar("cuenta") ? true : undefined}>
                  <SelectValue placeholder="Elige la cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {cuentasTipo.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{etiquetaCuenta(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {mostrar("cuenta") && <p className="text-sm text-destructive-text">{mostrar("cuenta")}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${ids}-ref`}>{metodo === "ZELLE" ? "Código de confirmación" : "Número de referencia"}</Label>
              <Input
                id={`${ids}-ref`}
                ref={referenciaRef}
                autoFocus
                autoComplete="off"
                inputMode={metodo === "ZELLE" ? "text" : "numeric"}
                className="font-mono"
                value={referencia}
                aria-invalid={mostrar("referencia", "referencia") ? true : undefined}
                onChange={(e) => editar(setReferencia)(e.target.value)}
              />
              {mostrar("referencia", "referencia") && (
                <p className="text-sm text-destructive-text">{mostrar("referencia", "referencia")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-fecha`}>Fecha del pago</Label>
              <Input
                id={`${ids}-fecha`}
                type="date"
                max={hoy}
                min={sumarDiasVE(hoy, -30)}
                value={fecha}
                aria-invalid={mostrar("fecha", "fecha") ? true : undefined}
                onChange={(e) => editar(setFecha)(e.target.value)}
              />
              {mostrar("fecha", "fecha") && <p className="text-sm text-destructive-text">{mostrar("fecha", "fecha")}</p>}
            </div>
          </div>

          {metodo !== "ZELLE" && (
            <div className="space-y-2">
              <Label htmlFor={`${ids}-banco`}>Banco del pasajero</Label>
              <Select value={banco} onValueChange={(v) => editar(setBanco)(v ?? "")}>
                <SelectTrigger id={`${ids}-banco`} className="w-full" aria-invalid={mostrar("banco", "banco") ? true : undefined}>
                  <SelectValue placeholder="Elige el banco" />
                </SelectTrigger>
                <SelectContent>
                  {OPCIONES_BANCO.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mostrar("banco", "banco") && <p className="text-sm text-destructive-text">{mostrar("banco", "banco")}</p>}
            </div>
          )}
        </div>
      )}

      {errorActivo && errorActivo.campo === null && (
        <p className="flex items-start gap-2 text-sm text-destructive-text" role="alert">
          <Warning weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorActivo.mensaje}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
        {onVolver ? (
          <Button type="button" variant="ghost" onClick={onVolver} disabled={enviando}>
            {textoVolver}
          </Button>
        ) : <span />}
        <Button type="submit" disabled={enviando || !tasa} className="whitespace-normal h-auto min-h-9 py-2">
          {enviando && <Spinner className="mr-2" />}
          {enviando ? "Cobrando…" : textoCobrar}
        </Button>
      </div>
    </form>
  );
}

/** Traduce un error del cobro (EB_*) al campo afectado del formulario. */
function errorDeCobro(res: Extract<ResultadoTaquilla<unknown>, { success: false }>): ErrorCampoCobro | null {
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

// ─── Boletos emitidos (pantalla final e impresión) ──────────────────────────

function TicketsEmitidos({
  operacion,
  trayecto,
  unidad,
  acciones,
}: {
  operacion: OperacionTaquilla;
  /** Ciudades del viaje tal como vienen de la ruta. */
  trayecto: { origen: string; destino: string } | null;
  unidad?: string | null;
  acciones: React.ReactNode;
}) {
  const { user } = useUser();
  const cooperativa = user?.cooperativa_nombre ?? "";
  const origen = formatCiudad(trayecto?.origen);
  const destino = formatCiudad(trayecto?.destino);
  const ruta = origen && destino ? `${origen} → ${destino}` : "";
  const [printing, setPrinting] = useState(false);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const { cobro } = operacion;
  const precioDe = (codigo: string) =>
    operacion.boletos.find((b) => b.codigo_boleto === codigo)?.precio_usd ??
    (cobro.total_usd ?? 0) / Math.max(operacion.impresion.length, 1);
  const salida = operacion.salida ? formatSalidaVenta(operacion.salida) : "";
  const enUsd = cobro.moneda === "USD";
  const fmt = (n: number) => (enUsd ? formatUsd(n) : formatBs(n));

  /**
   * Sin impresora térmica: solo los boletos (con su QR) en una ventana aparte.
   * Si el navegador bloquea la ventana se avisa; nunca se imprime la página entera.
   */
  const imprimirEnNavegador = () => {
    const html = ticketsRef.current?.innerHTML;
    if (!html || !imprimirHtml("Boletos", html)) {
      toast.error(MSG_VENTANA_BLOQUEADA);
    }
  };

  const viajeTicket =
    origen && destino && operacion.salida
      ? { cooperativa, origen, destino, salida: operacion.salida, unidad: unidad ?? null }
      : undefined;

  const imprimir = async () => {
    if (!printer.isConnected) {
      imprimirEnNavegador();
      return;
    }
    setPrinting(true);
    try {
      for (const b of operacion.impresion) {
        await printBoleto(
          {
            codigo_boleto: b.codigo_boleto,
            pasajero_nombre: b.pasajero,
            pasajero_cedula: b.cedula,
            asiento: b.asiento,
            precio: precioDe(b.codigo_boleto),
            qr_embarque_data: b.qr ?? `PASS-${b.codigo_boleto}`,
          } as Boleto,
          {
            monto_usd: precioDe(b.codigo_boleto),
            monto_bs: null,
            tasa: cobro.tasa ?? null,
            tasa_fecha: cobro.tasa_fecha ?? null,
            moneda: cobro.moneda,
          },
          viajeTicket
        );
      }
      toast.success(
        operacion.impresion.length === 1 ? "Boleto enviado a la impresora." : `${operacion.impresion.length} boletos enviados a la impresora.`
      );
    } catch (err) {
      console.error("Error al imprimir con Bluetooth:", err);
      toast.error("No pudimos imprimir por Bluetooth. Abrimos la impresión del navegador.");
      imprimirEnNavegador();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 rounded-full flex items-center justify-center">
          <Check className="w-7 h-7" weight="bold" />
        </div>
        <h2 className="text-xl font-bold">
          {operacion.impresion.length === 1 ? "Boleto emitido" : `${operacion.impresion.length} boletos emitidos`}
        </h2>
        <p className="text-sm text-muted-foreground">{ruta}{salida ? ` · ${salida}` : ""}</p>
      </div>

      <div className="grid gap-3 rounded-2xl bg-muted/50 p-4 sm:grid-cols-3" aria-live="polite">
        <div>
          <p className="text-xs text-muted-foreground">Cobrado</p>
          <p className="font-semibold tabular-nums">{fmt(cobro.esperado)}</p>
          {cobro.total_usd != null && !enUsd && (
            <p className="text-xs text-muted-foreground">
              ≈ {formatUsd(cobro.total_usd)}{cobro.tasa_fecha ? ` · BCV ${fechaTasaCorta(cobro.tasa_fecha)}` : ""}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Recibido</p>
          <p className="font-semibold tabular-nums">{fmt(cobro.recibido)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vuelto</p>
          <p className={cn("tabular-nums", cobro.vuelto > 0 ? "text-2xl font-bold text-primary-text" : "font-semibold")}>
            {fmt(cobro.vuelto)}
          </p>
        </div>
      </div>
      {operacion.repetido && (
        <p className="text-sm text-muted-foreground" role="status">
          Esta venta ya estaba registrada: no se cobró dos veces.
        </p>
      )}

      <div ref={ticketsRef} className="grid gap-3 sm:grid-cols-2 max-h-[40vh] overflow-y-auto pr-1">
        {operacion.impresion.map((b) => (
          <article key={b.codigo_boleto} className="rounded-xl border bg-background p-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Boleto de viaje</p>
            {cooperativa && <p className="text-sm font-semibold">{cooperativa}</p>}
            <p className="font-mono text-xl font-bold text-primary-text">{b.codigo_boleto}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Ruta</dt>
              <dd>{ruta}</dd>
              {salida && (
                <>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd>{salida}{unidad ? ` · Unidad ${unidad}` : ""}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Asiento</dt>
              <dd className="font-semibold">{b.asiento}</dd>
              <dt className="text-muted-foreground">Pasajero</dt>
              <dd>{b.pasajero ?? "—"}</dd>
              {b.cedula && (
                <>
                  <dt className="text-muted-foreground">Cédula</dt>
                  <dd>{b.cedula}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Precio</dt>
              <dd>
                {cobro.tasa && !enUsd
                  ? `${formatBs(usdABs(precioDe(b.codigo_boleto), cobro.tasa))} (${formatUsd(precioDe(b.codigo_boleto))})`
                  : formatUsd(precioDe(b.codigo_boleto))}
              </dd>
            </dl>
            <div className="flex justify-center rounded-lg bg-white p-2">
              <Suspense fallback={<Skeleton className="w-[120px] h-[120px]" />}>
                <QRCodeSVG value={b.qr || `PASS-${b.codigo_boleto}`} size={120} />
              </Suspense>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button className="flex-1" onClick={() => void imprimir()} disabled={printing} autoFocus>
          {printing ? <Spinner className="mr-2 h-4 w-4" /> : <Printer className="w-4 h-4 mr-2" />}
          {operacion.impresion.length === 1 ? "Imprimir boleto" : `Imprimir ${operacion.impresion.length} boletos`}
        </Button>
        {acciones}
      </div>
    </div>
  );
}

// ─── Flujo de venta ─────────────────────────────────────────────────────────

interface VentaFlowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Abre el flujo con este viaje ya elegido (p. ej. desde el embarque). */
  viajeIdInicial?: string | null;
}

export function VentaFlow({ isOpen, onClose, viajeIdInicial }: VentaFlowProps) {
  const { user } = useUser();
  const cooperativaId = user?.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);
  const ids = useId();

  const [step, setStep] = useState<VentaStep>("viaje");
  const [selectedViaje, setSelectedViaje] = useState<ViajeParaVenta | null>(null);
  const [asientos, setAsientos] = useState<string[]>([]);
  const [pasajeros, setPasajeros] = useState<Record<string, DatosPasajero>>({});
  const [intentoPasajeros, setIntentoPasajeros] = useState(false);

  const [viajes, setViajes] = useState<ViajeParaVenta[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(true);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);
  const [filtroRuta, setFiltroRuta] = useState<string>("todas");

  const [idemKey, setIdemKey] = useState(nuevaClave);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enviandoRef = useRef(false);
  const [errorCobro, setErrorCobro] = useState<ErrorCampoCobro | null>(null);
  const [operacion, setOperacion] = useState<OperacionTaquilla | null>(null);
  const viajeInicialUsado = useRef<string | null>(null);

  /** Un solo reinicio para cerrar y para "Vender otro" (no arrastra el pago anterior). */
  const reiniciar = useCallback(() => {
    setStep("viaje");
    setSelectedViaje(null);
    setAsientos([]);
    setPasajeros({});
    setIntentoPasajeros(false);
    setErrorCobro(null);
    setOperacion(null);
    setIdemKey(nuevaClave());
    viajeInicialUsado.current = null;
  }, []);

  const fetchViajes = useCallback(async () => {
    if (!cooperativaId) return;
    setLoadingViajes(true);
    setErrorViajes(null);
    try {
      const { data, error } = await supabase
        .from("viajes")
        .select(`
          id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
          asientos_disponibles, estado, numero_unidad,
          ruta:rutas(ciudad_origen, estado_origen, ciudad_destino, estado_destino, precio_pasaje)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "PROGRAMADO")
        // El servidor acepta ventas hasta 30 minutos después de la hora de salida.
        .gt("fecha_hora_salida", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order("fecha_hora_salida", { ascending: true });

      if (error) throw error;
      const lista = (data as unknown) as ViajeParaVenta[];
      setViajes(lista);
      if (viajeIdInicial && viajeInicialUsado.current !== viajeIdInicial) {
        viajeInicialUsado.current = viajeIdInicial;
        const inicial = lista.find((v) => v.id === viajeIdInicial);
        if (inicial) {
          setSelectedViaje(inicial);
          setStep("asiento");
        }
      }
    } catch (error) {
      console.error(error);
      setErrorViajes(humanizeError(error, "cargar los viajes disponibles"));
    } finally {
      setLoadingViajes(false);
    }
  }, [supabase, cooperativaId, viajeIdInicial]);

  useEffect(() => {
    if (isOpen && step === "viaje") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchViajes();
    }
  }, [isOpen, step, fetchViajes]);

  const handleOpenChange = (open: boolean) => {
    if (open || enviandoRef.current) return;
    onClose();
    // Reinicia después de la animación de cierre.
    setTimeout(reiniciar, 300);
  };

  const handleSelectViaje = (viaje: ViajeParaVenta) => {
    if (viaje.id !== selectedViaje?.id) {
      setAsientos([]);
      setPasajeros({});
    }
    setSelectedViaje(viaje);
    setStep("asiento");
  };

  const handleConfirmAsientos = (elegidos: string[]) => {
    setAsientos(elegidos);
    setPasajeros((prev) => {
      const siguiente: Record<string, DatosPasajero> = {};
      for (const a of elegidos) siguiente[a] = prev[a] ?? { nombre: "", cedula: "", telefono: "" };
      return siguiente;
    });
    setIntentoPasajeros(false);
    setStep("pasajero");
  };

  const actualizarPasajero = (asiento: string, campo: keyof DatosPasajero, valor: string) => {
    setPasajeros((prev) => ({ ...prev, [asiento]: { ...prev[asiento], [campo]: valor } }));
  };

  const erroresPasajero = (p: DatosPasajero | undefined) => ({
    nombre: !p || p.nombre.trim().length < 3 ? "Escribe el nombre y apellido del pasajero." : null,
    cedula: !p || !cedulaValida(p.cedula) ? "Escribe una cédula válida, por ejemplo V-12345678." : null,
  });
  const pasajerosValidos = asientos.every((a) => {
    const e = erroresPasajero(pasajeros[a]);
    return !e.nombre && !e.cedula;
  });

  const continuarAPago = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentoPasajeros(true);
    if (!pasajerosValidos) {
      const primero = asientos.find((a) => {
        const err = erroresPasajero(pasajeros[a]);
        return err.nombre || err.cedula;
      });
      if (primero) document.getElementById(`${ids}-nombre-${primero}`)?.focus();
      return;
    }
    setErrorCobro(null);
    setStep("pago");
  };

  const handleCobrar = async (datos: DatosPagoTaquilla) => {
    if (!selectedViaje || asientos.length === 0 || enviandoRef.current) return;
    enviandoRef.current = true;
    setIsSubmitting(true);
    setErrorCobro(null);
    try {
      const result = await requireOnline(() =>
        venderBoletos({
          viajeId: selectedViaje.id,
          pasajeros: asientos.map((a) => ({
            asiento: a,
            nombre: pasajeros[a].nombre.trim(),
            cedula: formatearCedula(pasajeros[a].cedula),
            telefono: pasajeros[a].telefono.trim() || null,
          })),
          ...datos,
          idemKey,
        })
      )();

      if (result.success) {
        setOperacion(result.data);
        setStep("confirmacion");
        toast.success(
          result.data.impresion.length === 1 ? "Boleto vendido." : `${result.data.impresion.length} boletos vendidos.`
        );
        return;
      }

      const errCampo = errorDeCobro(result);
      if (result.codigo === "EB_ASIENTO_OCUPADO") {
        const tomados = (result.detalle?.asientos ?? []).map(String);
        toast.error(result.error);
        if (tomados.length > 0) setAsientos((prev) => prev.filter((a) => !tomados.includes(a)));
        setStep("asiento");
      } else if (result.codigo === "EB_VIAJE_NO_DISPONIBLE" || result.codigo === "EB_NO_ENCONTRADO") {
        toast.error(result.error);
        setSelectedViaje(null);
        setStep("viaje");
      } else if (result.codigo === "EB_DATOS_INVALIDOS" && /pasajero|cédula|nombre/i.test(result.error)) {
        toast.error(result.error);
        setIntentoPasajeros(true);
        setStep("pasajero");
      } else if (errCampo) {
        setErrorCobro(errCampo);
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      console.error(err);
      toast.error(mensajeExcepcion(err, "vender los boletos"));
    } finally {
      enviandoRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Rutas únicas para el filtro
  const rutasUnicas = useMemo(() => {
    const set = new Set<string>();
    viajes.forEach((v) => set.add(`${v.ruta.ciudad_origen} → ${v.ruta.ciudad_destino}`));
    return Array.from(set);
  }, [viajes]);

  const viajesFiltrados = useMemo(() => {
    if (filtroRuta === "todas") return viajes;
    return viajes.filter((v) => `${v.ruta.ciudad_origen} → ${v.ruta.ciudad_destino}` === filtroRuta);
  }, [viajes, filtroRuta]);

  const rutaTexto = selectedViaje ? `${selectedViaje.ruta.ciudad_origen} → ${selectedViaje.ruta.ciudad_destino}` : "";
  const pasoActual = PASOS.findIndex((p) => p.id === step);
  const totalUsd = selectedViaje ? Number(selectedViaje.ruta.precio_pasaje) * asientos.length : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vender boletos</DialogTitle>
          <DialogDescription>
            Paso {pasoActual + 1} de {PASOS.length}: {PASOS[pasoActual]?.titulo}
            {selectedViaje && step !== "viaje" && ` · ${rutaTexto} · ${formatSalidaVenta(selectedViaje.fecha_hora_salida)}`}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1.5" aria-label="Progreso de la venta">
          {PASOS.map((p, i) => (
            <li
              key={p.id}
              aria-current={i === pasoActual ? "step" : undefined}
              className={cn("h-1.5 flex-1 rounded-full", i <= pasoActual ? "bg-primary" : "bg-muted")}
            >
              <span className="sr-only">{p.titulo}</span>
            </li>
          ))}
        </ol>

        {step === "viaje" && (
          <div className="space-y-4">
            <div className="w-full sm:w-[300px]">
              <Label htmlFor={`${ids}-ruta`} className="sr-only">Filtrar por ruta</Label>
              <Select value={filtroRuta} onValueChange={(val) => setFiltroRuta(val ?? "todas")}>
                <SelectTrigger id={`${ids}-ruta`}>
                  <SelectValue placeholder="Filtrar por ruta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las rutas</SelectItem>
                  {rutasUnicas.map((ruta) => (
                    <SelectItem key={ruta} value={ruta}>{ruta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {loadingViajes ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <Spinner size="lg" />
                  <p>Cargando viajes disponibles…</p>
                </div>
              ) : errorViajes ? (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-destructive-text">{errorViajes}</p>
                  <Button variant="outline" onClick={() => void fetchViajes()}>
                    <ArrowClockwise className="w-4 h-4 mr-2" />
                    Reintentar
                  </Button>
                </div>
              ) : viajesFiltrados.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground border rounded-lg bg-muted/20">
                  <p>No hay viajes programados a la venta. Prográmalos en Viajes.</p>
                </div>
              ) : (
                viajesFiltrados.map((viaje) => {
                  const sinAsientos = viaje.asientos_disponibles <= 0;
                  const pocosAsientos = viaje.asientos_disponibles <= 5 && !sinAsientos;
                  const sinPrecio = !(Number(viaje.ruta.precio_pasaje) > 0);

                  return (
                    <button
                      key={viaje.id}
                      type="button"
                      disabled={sinAsientos || sinPrecio}
                      onClick={() => handleSelectViaje(viaje)}
                      className={cn(
                        "w-full rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
                        sinAsientos || sinPrecio ? "opacity-60 cursor-not-allowed" : "hover:border-primary/50 hover:bg-muted/30"
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-lg">
                          <span>{viaje.ruta.ciudad_origen}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" aria-label="a" />
                          <span>{viaje.ruta.ciudad_destino}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" aria-hidden />
                            {formatSalidaVenta(viaje.fecha_hora_salida)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" aria-hidden />
                            Unidad {viaje.numero_unidad}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                        {sinPrecio ? (
                          <span className="text-sm text-destructive-text">Sin precio: configúralo en Rutas</span>
                        ) : (
                          <Monto usd={Number(viaje.ruta.precio_pasaje)} align="right" className="text-primary-text" />
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="w-4 h-4 text-muted-foreground" aria-hidden />
                            <span className={pocosAsientos ? "text-amber-600 font-medium" : sinAsientos ? "text-red-600 font-medium" : ""}>
                              {viaje.asientos_disponibles} libres de {viaje.asientos_totales}
                            </span>
                          </div>
                          {sinAsientos && <Badge variant="destructive">Agotado</Badge>}
                          {pocosAsientos && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-transparent">Pocos asientos</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {step === "asiento" && selectedViaje && (
          <SeatSelector
            key={`${selectedViaje.id}-${asientos.join(",")}`}
            viajeId={selectedViaje.id}
            totalAsientos={selectedViaje.asientos_totales}
            seleccionInicial={asientos}
            onConfirm={handleConfirmAsientos}
            onCancel={() => setStep("viaje")}
          />
        )}

        {step === "pasajero" && (
          <form className="space-y-4" onSubmit={continuarAPago} noValidate>
            <p className="text-sm text-muted-foreground">
              Escribe los datos de cada pasajero: salen impresos en su boleto y se revisan al embarcar.
            </p>
            <div className="grid gap-4 max-h-[55vh] overflow-y-auto pr-1">
              {asientos.map((asiento, i) => {
                const p = pasajeros[asiento] ?? { nombre: "", cedula: "", telefono: "" };
                const err = intentoPasajeros ? erroresPasajero(p) : { nombre: null, cedula: null };
                return (
                  <fieldset key={asiento} className="rounded-xl border p-4 space-y-3">
                    <legend className="px-1 text-sm font-semibold">Asiento {asiento}</legend>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${ids}-nombre-${asiento}`}>Nombre y apellido</Label>
                      <Input
                        id={`${ids}-nombre-${asiento}`}
                        autoFocus={i === 0}
                        autoComplete="off"
                        placeholder="Ej. Ana Pérez"
                        value={p.nombre}
                        aria-invalid={err.nombre ? true : undefined}
                        onChange={(e) => actualizarPasajero(asiento, "nombre", e.target.value)}
                      />
                      {err.nombre && <p className="text-sm text-destructive-text">{err.nombre}</p>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${ids}-cedula-${asiento}`}>Cédula</Label>
                        <Input
                          id={`${ids}-cedula-${asiento}`}
                          autoComplete="off"
                          placeholder="Ej. V-12345678"
                          value={p.cedula}
                          aria-invalid={err.cedula ? true : undefined}
                          onChange={(e) => actualizarPasajero(asiento, "cedula", e.target.value)}
                          onBlur={(e) => {
                            if (cedulaValida(e.target.value)) actualizarPasajero(asiento, "cedula", formatearCedula(e.target.value));
                          }}
                        />
                        {err.cedula && <p className="text-sm text-destructive-text">{err.cedula}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${ids}-telefono-${asiento}`}>Teléfono (opcional)</Label>
                        <Input
                          id={`${ids}-telefono-${asiento}`}
                          type="tel"
                          autoComplete="off"
                          placeholder="Ej. 0414-1234567"
                          value={p.telefono}
                          onChange={(e) => actualizarPasajero(asiento, "telefono", e.target.value)}
                        />
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="flex justify-between border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setStep("asiento")}>Volver</Button>
              <Button type="submit">Continuar al cobro</Button>
            </div>
          </form>
        )}

        {step === "pago" && selectedViaje && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {asientos.length === 1 ? "1 boleto" : `${asientos.length} boletos`} · {rutaTexto} ·{" "}
              {asientos.length === 1 ? "asiento" : "asientos"} {listaAsientos(asientos)}
            </p>
            <CobroTaquillaForm
              totalUsd={totalUsd}
              enviando={isSubmitting}
              errorCampo={errorCobro}
              onCobrar={(d) => void handleCobrar(d)}
              onVolver={() => setStep("pasajero")}
            />
          </div>
        )}

        {step === "confirmacion" && operacion && (
          <TicketsEmitidos
            operacion={operacion}
            trayecto={
              selectedViaje
                ? { origen: selectedViaje.ruta.ciudad_origen, destino: selectedViaje.ruta.ciudad_destino }
                : null
            }
            unidad={selectedViaje?.numero_unidad}
            acciones={
              <>
                <Button variant="outline" className="flex-1" onClick={reiniciar}>
                  Vender otro
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => handleOpenChange(false)}>
                  Cerrar
                </Button>
              </>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Cobrar en taquilla una reserva de la app ───────────────────────────────

type ReservaParaCobro = {
  compraId: string;
  asientos: string[];
  totalUsd: number;
  pasajero: string | null;
  ruta: string;
  trayecto: { origen: string; destino: string } | null;
  salida: string | null;
  unidad: string | null;
};

export function CobrarReservaDialog({
  boletoId,
  open,
  onOpenChange,
  onCobrado,
}: {
  boletoId: string | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Se llama tras cobrar (para recargar la lista o volver a validar el embarque). */
  onCobrado?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [reserva, setReserva] = useState<ReservaParaCobro | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState(nuevaClave);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [errorCobro, setErrorCobro] = useState<ErrorCampoCobro | null>(null);
  const [operacion, setOperacion] = useState<OperacionTaquilla | null>(null);

  const cargar = useCallback(async () => {
    if (!boletoId) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const { data: base, error: e1 } = await supabase
        .from("boletos")
        .select("compra_id")
        .eq("id", boletoId)
        .single();
      if (e1) throw e1;
      const { data, error } = await supabase
        .from("boletos")
        .select(`
          asiento, precio, pasajero_nombre,
          viaje:viajes!viaje_id(fecha_hora_salida, numero_unidad, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino))
        `)
        .eq("compra_id", (base as { compra_id: string }).compra_id)
        .eq("estado", "RESERVADO");
      if (error) throw error;
      const filas = (data ?? []) as unknown as {
        asiento: string;
        precio: number;
        pasajero_nombre: string | null;
        viaje: {
          fecha_hora_salida: string;
          numero_unidad: string | null;
          ruta: { ciudad_origen: string; ciudad_destino: string } | null;
        } | null;
      }[];
      if (filas.length === 0) {
        setReserva(null);
        setErrorCarga("Esta reserva ya no está pendiente de pago. Actualiza la lista.");
        return;
      }
      const v = filas[0].viaje;
      setReserva({
        compraId: (base as { compra_id: string }).compra_id,
        asientos: filas.map((f) => f.asiento).sort((a, b) => Number(a) - Number(b)),
        totalUsd: filas.reduce((s, f) => s + Number(f.precio), 0),
        pasajero: filas.find((f) => f.pasajero_nombre)?.pasajero_nombre ?? null,
        ruta: v?.ruta ? `${v.ruta.ciudad_origen} → ${v.ruta.ciudad_destino}` : "",
        trayecto: v?.ruta ? { origen: v.ruta.ciudad_origen, destino: v.ruta.ciudad_destino } : null,
        salida: v?.fecha_hora_salida ?? null,
        unidad: v?.numero_unidad ?? null,
      });
    } catch (err) {
      console.error(err);
      setErrorCarga(mensajeExcepcion(err, "cargar la reserva"));
    } finally {
      setCargando(false);
    }
  }, [supabase, boletoId]);

  useEffect(() => {
    if (!open || !boletoId) return;
    const reiniciarYCargar = async () => {
      setReserva(null);
      setOperacion(null);
      setErrorCobro(null);
      setIdemKey(nuevaClave());
      await cargar();
    };
    void reiniciarYCargar();
  }, [open, boletoId, cargar]);

  const cambiarAbierto = (abierto: boolean) => {
    if (!abierto && enviandoRef.current) return;
    onOpenChange(abierto);
  };

  const cobrar = async (datos: DatosPagoTaquilla) => {
    if (!boletoId || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErrorCobro(null);
    try {
      const res = await requireOnline(() => cobrarReserva({ boletoId, ...datos, idemKey }))();
      if (res.success) {
        setOperacion(res.data);
        toast.success("Reserva cobrada. Los boletos ya están activos.");
        onCobrado?.();
        return;
      }
      const errCampo = errorDeCobro(res);
      if (errCampo) setErrorCobro(errCampo);
      else toast.error(res.error);
      if (res.codigo === "EB_ESTADO_CAMBIO" || res.codigo === "EB_PAGO_PENDIENTE_EXISTE") {
        // La reserva cambió de estado (otro compañero la cobró o el pasajero reportó un pago): cerrar.
        onCobrado?.();
        onOpenChange(false);
      }
    } catch (err) {
      console.error(err);
      toast.error(mensajeExcepcion(err, "cobrar la reserva"));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operacion ? "Reserva cobrada" : "Cobrar reserva"}</DialogTitle>
          <DialogDescription>
            {reserva
              ? `${reserva.asientos.length === 1 ? "1 boleto" : `${reserva.asientos.length} boletos`} · ${reserva.ruta}${
                  reserva.salida ? ` · ${formatSalidaVenta(reserva.salida)}` : ""
                } · ${reserva.asientos.length === 1 ? "asiento" : "asientos"} ${listaAsientos(reserva.asientos)}${
                  reserva.pasajero ? ` · ${reserva.pasajero}` : ""
                }`
              : "El pasajero apartó desde la app y paga aquí."}
          </DialogDescription>
        </DialogHeader>

        {cargando && !reserva ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Spinner size="sm" /> Cargando la reserva…
          </div>
        ) : errorCarga && !reserva ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="text-sm text-destructive-text" role="alert">{errorCarga}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        ) : operacion ? (
          <TicketsEmitidos
            operacion={operacion}
            trayecto={reserva?.trayecto ?? null}
            unidad={reserva?.unidad}
            acciones={
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            }
          />
        ) : reserva ? (
          <CobroTaquillaForm
            totalUsd={reserva.totalUsd}
            enviando={enviando}
            errorCampo={errorCobro}
            onCobrar={(d) => void cobrar(d)}
            onVolver={() => onOpenChange(false)}
            textoVolver="Cancelar"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
