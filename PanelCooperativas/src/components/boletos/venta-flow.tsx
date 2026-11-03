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
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { CalendarBlank, CheckCircle, Printer, Money, CurrencyDollar, DeviceMobile, Bank } from "@phosphor-icons/react";
import { SeatSelector, listaAsientos } from "./seat-selector";
import { Monto } from "@/components/monto";
import { AvisoError } from "@/components/aviso-error";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { TonoBadge } from "@/components/status-badge";
import { avisarError, avisarExito } from "@/lib/avisos";
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
import { CEDULA_ERROR, CEDULA_PLACEHOLDER, TELEFONO_PLACEHOLDER, cedulaParaGuardar, cedulaValida, formatCedula } from "@/lib/ve";
import { formatCodigoBoleto, qrBoleto } from "@/lib/artefactos.generated";
import { printer } from "@/lib/printing/bluetooth";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd, usdABs } from "@/lib/dinero";
import { formatFechaHoraCortaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import type { TipoMetodoPago } from "@/lib/types/pagos";
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

/** "04/11 · 8:00 a. m." en hora de Venezuela (D4). */
export function formatSalidaVenta(iso: string) {
  return formatFechaHoraCortaVE(iso);
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

// Iconos de §2.3: Money efectivo, DeviceMobile Pago Móvil, Bank Transferencia, CurrencyDollar Zelle.
const METODOS: { id: MetodoCobro; titulo: string; Icono: typeof Money }[] = [
  { id: "EFECTIVO_VES", titulo: "Efectivo Bs", Icono: Money },
  { id: "EFECTIVO_USD", titulo: "Efectivo USD", Icono: Money },
  { id: "PAGO_MOVIL", titulo: "Pago Móvil", Icono: DeviceMobile },
  { id: "TRANSFERENCIA_BANCARIA", titulo: "Transferencia", Icono: Bank },
  { id: "ZELLE", titulo: "Zelle", Icono: CurrencyDollar },
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

export function CobroTaquillaForm({ totalUsd, enviando, errorCampo, onCobrar, onVolver, textoVolver = "Atrás" }: CobroFormProps) {
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

  const textoCobrar = `Cobrar ${enUsd ? formatUsd(totalUsd) : tasa ? formatBs(totalBs ?? 0) : formatUsd(totalUsd)}`;
  const ayudaMonto = mostrar("monto", "monto");

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <section aria-label="Total a cobrar" className="flex flex-col gap-1 rounded-md bg-muted/50 p-4">
        <p className="text-xs font-medium text-muted-foreground">Total a cobrar</p>
        <Monto usd={totalUsd} moneda={enUsd ? "USD" : undefined} size="lg" />
      </section>
      {!tasa && <AvisoError>Sin tasa BCV de hoy: no se puede cobrar.</AvisoError>}

      <div className="flex flex-col gap-2">
        <p id={`${ids}-metodo`} className="text-sm font-medium text-foreground">
          ¿Cómo pagó?
        </p>
        <GrupoOpciones etiqueta="¿Cómo pagó?" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

      {efectivo ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-recibido`}>Monto recibido ({enUsd ? "USD" : "Bs"})</Label>
            <Input
              id={`${ids}-recibido`}
              ref={recibidoRef}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder={esperado !== null ? `Ej.: ${formatNumeroVE(esperado)}` : ""}
              value={recibidoTexto}
              aria-invalid={ayudaMonto ? true : undefined}
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
            <p id={`${ids}-recibido-ayuda`} className={cn("text-sm", ayudaMonto ? "text-destructive-text" : "text-muted-foreground")}>
              {ayudaMonto ?? "Para calcular el vuelto."}
            </p>
          </div>
          <div className="flex flex-col gap-1 self-start rounded-md border border-border bg-card p-4" aria-live="polite">
            <p className="text-xs font-medium text-muted-foreground">Vuelto</p>
            <p className={cn("text-2xl font-semibold tabular-nums", diferencia !== null && diferencia < 0 && "text-destructive-text")}>
              {diferencia === null ? "—" : diferencia < 0 ? `Faltan ${fmt(-diferencia)}` : fmt(diferencia)}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {tasa && (
            <p className="text-sm text-muted-foreground">
              Confirma que llegaron{" "}
              <strong className="font-semibold text-foreground">{metodo === "ZELLE" ? formatUsd(totalUsd) : formatBs(totalBs ?? 0)}</strong>.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-cuenta`}>Cuenta que recibió el pago</Label>
            {cuentasTipo.length === 0 ? (
              <p id={`${ids}-cuenta`} className="text-sm text-muted-foreground">
                {errorCuentas
                  ? "No pudimos cargar las cuentas: el pago se registra sin cuenta."
                  : `Sin cuentas de ${NOMBRE_TIPO[tipo as Exclude<TipoMetodoPago, "EFECTIVO">]} activas: se registra sin cuenta.`}
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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

      {errorActivo && errorActivo.campo === null && <AvisoError>{errorActivo.mensaje}</AvisoError>}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        {onVolver ? (
          <Button type="button" variant="outline" onClick={onVolver} disabled={enviando}>
            {textoVolver}
          </Button>
        ) : <span />}
        <Button type="submit" disabled={enviando || !tasa} aria-busy={enviando || undefined}>
          {enviando && <Spinner size="sm" />}
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
      avisarError(MSG_VENTANA_BLOQUEADA);
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
            qr_embarque_data: qrBoleto({ codigo_boleto: b.codigo_boleto, qr_embarque_data: b.qr }),
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
      avisarExito(
        operacion.impresion.length === 1 ? "Boleto enviado a la impresora." : `${operacion.impresion.length} boletos enviados a la impresora.`
      );
    } catch {
      // Sin Bluetooth se imprime desde el navegador (el aviso de bloqueo sale de imprimirEnNavegador).
      imprimirEnNavegador();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success-light">
          <CheckCircle className="size-7 text-success-text" weight="fill" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">
          {operacion.impresion.length === 1 ? "Boleto emitido" : `${operacion.impresion.length} boletos emitidos`}
        </h2>
        <p className="text-sm text-muted-foreground">{ruta}{salida ? ` · ${salida}` : ""}</p>
      </div>

      <div className="grid gap-3 rounded-md bg-muted/50 p-4 sm:grid-cols-3" aria-live="polite">
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
          <p className={cn("font-semibold tabular-nums", cobro.vuelto > 0 && "text-2xl")}>
            {fmt(cobro.vuelto)}
          </p>
        </div>
      </div>
      {operacion.repetido && (
        <p className="text-sm text-muted-foreground" role="status">
          Esta venta ya estaba registrada: no se cobró dos veces.
        </p>
      )}

      <div ref={ticketsRef} className="grid gap-3 sm:grid-cols-2">
        {operacion.impresion.map((b) => (
          <article key={b.codigo_boleto} className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Boleto de viaje</p>
            {cooperativa && <p className="text-sm font-semibold">{cooperativa}</p>}
            <p className="font-mono text-lg font-semibold text-foreground">{formatCodigoBoleto(b.codigo_boleto)}</p>
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
                  <dd>{formatCedula(b.cedula)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Precio</dt>
              <dd>
                {cobro.tasa && !enUsd
                  ? `${formatBs(usdABs(precioDe(b.codigo_boleto), cobro.tasa))} (${formatUsd(precioDe(b.codigo_boleto))})`
                  : formatUsd(precioDe(b.codigo_boleto))}
              </dd>
            </dl>
            <div className="flex justify-center rounded-sm bg-white p-2">
              <Suspense fallback={<Skeleton className="size-[120px]" />}>
                <QRCodeSVG value={qrBoleto({ codigo_boleto: b.codigo_boleto, qr_embarque_data: b.qr })} size={120} />
              </Suspense>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {acciones}
        <Button onClick={() => void imprimir()} disabled={printing} aria-busy={printing || undefined} autoFocus>
          {printing ? <Spinner size="sm" /> : <Printer aria-hidden />}
          {operacion.impresion.length === 1 ? "Imprimir boleto" : `Imprimir ${operacion.impresion.length} boletos`}
        </Button>
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

/** "Caracas → Valencia" */
function rutaDeViaje(v: ViajeParaVenta) {
  return `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}`;
}

/** Pie de un paso: salida `outline` a la izquierda, acción a la derecha (§2.3). */
function PiePaso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">{children}</div>
  );
}

export function VentaFlow({ isOpen, onClose, viajeIdInicial }: VentaFlowProps) {
  const { user } = useUser();
  const cooperativaId = user?.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);
  const ids = useId();

  const [step, setStep] = useState<VentaStep>("viaje");
  const [selectedViaje, setSelectedViaje] = useState<ViajeParaVenta | null>(null);
  /** Viaje marcado en el paso 1 (tocar selecciona; "Continuar" avanza). */
  const [viajeMarcado, setViajeMarcado] = useState<string | null>(null);
  const [asientos, setAsientos] = useState<string[]>([]);
  const [pasajeros, setPasajeros] = useState<Record<string, DatosPasajero>>({});
  const [intentoPasajeros, setIntentoPasajeros] = useState(false);
  /** Error que hizo volver a un paso anterior (asiento tomado, viaje cerrado…). */
  const [aviso, setAviso] = useState<string | null>(null);

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
    setViajeMarcado(null);
    setAsientos([]);
    setPasajeros({});
    setIntentoPasajeros(false);
    setAviso(null);
    setErrorCobro(null);
    setOperacion(null);
    setIdemKey(nuevaClave());
    viajeInicialUsado.current = null;
  }, []);

  const irA = (paso: VentaStep) => {
    setAviso(null);
    setStep(paso);
  };

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
          setViajeMarcado(inicial.id);
          setStep("asiento");
        }
      }
    } catch (error) {
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

  const continuarConViaje = () => {
    const viaje = viajes.find((v) => v.id === viajeMarcado);
    if (!viaje) return;
    if (viaje.id !== selectedViaje?.id) {
      setAsientos([]);
      setPasajeros({});
    }
    setSelectedViaje(viaje);
    irA("asiento");
  };

  const handleConfirmAsientos = (elegidos: string[]) => {
    setAsientos(elegidos);
    setPasajeros((prev) => {
      const siguiente: Record<string, DatosPasajero> = {};
      for (const a of elegidos) siguiente[a] = prev[a] ?? { nombre: "", cedula: "", telefono: "" };
      return siguiente;
    });
    setIntentoPasajeros(false);
    irA("pasajero");
  };

  const actualizarPasajero = (asiento: string, campo: keyof DatosPasajero, valor: string) => {
    setPasajeros((prev) => ({ ...prev, [asiento]: { ...prev[asiento], [campo]: valor } }));
  };

  const erroresPasajero = (p: DatosPasajero | undefined) => ({
    nombre: !p || p.nombre.trim().length < 3 ? "Escribe el nombre y apellido." : null,
    cedula: !p || !cedulaValida(p.cedula) ? CEDULA_ERROR : null,
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
    irA("pago");
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
        irA("confirmacion");
        return;
      }

      const errCampo = errorDeCobro(result);
      if (result.codigo === "EB_ASIENTO_OCUPADO") {
        const tomados = (result.detalle?.asientos ?? []).map(String);
        if (tomados.length > 0) setAsientos((prev) => prev.filter((a) => !tomados.includes(a)));
        setStep("asiento");
        setAviso(result.error);
      } else if (result.codigo === "EB_VIAJE_NO_DISPONIBLE" || result.codigo === "EB_NO_ENCONTRADO") {
        setSelectedViaje(null);
        setViajeMarcado(null);
        setStep("viaje");
        setAviso(result.error);
      } else if (result.codigo === "EB_DATOS_INVALIDOS" && /pasajero|cédula|nombre/i.test(result.error)) {
        setIntentoPasajeros(true);
        setStep("pasajero");
        setAviso(result.error);
      } else {
        setErrorCobro(errCampo ?? { campo: null, mensaje: result.error });
      }
    } catch (err) {
      setErrorCobro({ campo: null, mensaje: mensajeExcepcion(err, "vender los boletos") });
    } finally {
      enviandoRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Rutas únicas para el filtro
  const rutasUnicas = useMemo(() => Array.from(new Set(viajes.map(rutaDeViaje))), [viajes]);

  const viajesFiltrados = useMemo(() => {
    if (filtroRuta === "todas") return viajes;
    return viajes.filter((v) => rutaDeViaje(v) === filtroRuta);
  }, [viajes, filtroRuta]);

  const rutaTexto = selectedViaje ? rutaDeViaje(selectedViaje) : "";
  const pasoActual = PASOS.findIndex((p) => p.id === step);
  const totalUsd = selectedViaje ? Number(selectedViaje.ruta.precio_pasaje) * asientos.length : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent tamano="flujo">
        <DialogHeader>
          <DialogTitle>Vender boletos</DialogTitle>
          <DialogDescription>
            Paso {pasoActual + 1} de {PASOS.length} · {PASOS[pasoActual]?.titulo}
            {selectedViaje && step !== "viaje" && ` · ${rutaTexto} · ${formatSalidaVenta(selectedViaje.fecha_hora_salida)}`}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1.5" aria-label="Progreso de la venta">
          {PASOS.map((p, i) => (
            <li
              key={p.id}
              aria-current={i === pasoActual ? "step" : undefined}
              className={cn("h-1.5 flex-1 rounded-full", i <= pasoActual ? "bg-accent-strong" : "bg-muted")}
            >
              <span className="sr-only">{p.titulo}</span>
            </li>
          ))}
        </ol>

        {aviso && <AvisoError>{aviso}</AvisoError>}

        {step === "viaje" && (
          <div className="flex flex-col gap-4">
            <div className="flex w-full flex-col gap-2 sm:w-72">
              <Label htmlFor={`${ids}-ruta`}>Ruta</Label>
              <Select
                value={filtroRuta}
                onValueChange={(val) => setFiltroRuta(val ?? "todas")}
                items={{ todas: "Todas las rutas", ...Object.fromEntries(rutasUnicas.map((r) => [r, r])) }}
              >
                <SelectTrigger id={`${ids}-ruta`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las rutas</SelectItem>
                  {rutasUnicas.map((ruta) => (
                    <SelectItem key={ruta} value={ruta}>{ruta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loadingViajes ? (
              <div className="grid gap-2" role="status" aria-label="Cargando los viajes">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-md" />
                ))}
              </div>
            ) : errorViajes ? (
              <ErrorState compacto titulo="No pudimos cargar los viajes" descripcion={errorViajes} onReintentar={fetchViajes} />
            ) : viajesFiltrados.length === 0 ? (
              <EmptyState compacto icon={CalendarBlank} title="No hay viajes a la venta" description="Programa las salidas en Viajes." />
            ) : (
              <GrupoOpciones etiqueta="Viaje" className="grid gap-2">
                {viajesFiltrados.map((viaje) => {
                  const sinAsientos = viaje.asientos_disponibles <= 0;
                  const pocosAsientos = viaje.asientos_disponibles <= 5 && !sinAsientos;
                  const sinPrecio = !(Number(viaje.ruta.precio_pasaje) > 0);
                  return (
                    <OpcionTile
                      key={viaje.id}
                      seleccionado={viajeMarcado === viaje.id}
                      onSelect={() => setViajeMarcado(viaje.id)}
                      disabled={sinAsientos || sinPrecio}
                      titulo={<span className="text-base">{rutaDeViaje(viaje)}</span>}
                      detalle={
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="tabular-nums">{formatSalidaVenta(viaje.fecha_hora_salida)}</span>
                          {viaje.numero_unidad && <span>Unidad {viaje.numero_unidad}</span>}
                          <span className="tabular-nums">
                            {viaje.asientos_disponibles} libres de {viaje.asientos_totales}
                          </span>
                          {sinAsientos && <TonoBadge tono="peligro">Agotado</TonoBadge>}
                          {pocosAsientos && <TonoBadge tono="pendiente">Quedan {viaje.asientos_disponibles}</TonoBadge>}
                          {sinPrecio ? (
                            <TonoBadge tono="peligro">Sin precio</TonoBadge>
                          ) : (
                            <Monto usd={Number(viaje.ruta.precio_pasaje)} size="sm" className="text-foreground" />
                          )}
                        </span>
                      }
                    />
                  );
                })}
              </GrupoOpciones>
            )}

            <PiePaso>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={continuarConViaje} disabled={!viajes.some((v) => v.id === viajeMarcado)}>
                Continuar
              </Button>
            </PiePaso>
          </div>
        )}

        {step === "asiento" && selectedViaje && (
          <SeatSelector
            key={`${selectedViaje.id}-${asientos.join(",")}`}
            viajeId={selectedViaje.id}
            totalAsientos={selectedViaje.asientos_totales}
            seleccionInicial={asientos}
            onConfirm={handleConfirmAsientos}
            onCancel={() => irA("viaje")}
          />
        )}

        {step === "pasajero" && (
          <form className="flex flex-col gap-4" onSubmit={continuarAPago} noValidate>
            {asientos.map((asiento, i) => {
              const p = pasajeros[asiento] ?? { nombre: "", cedula: "", telefono: "" };
              const err = intentoPasajeros ? erroresPasajero(p) : { nombre: null, cedula: null };
              return (
                <fieldset key={asiento} className="flex flex-col gap-4 rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-semibold">Asiento {asiento}</legend>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`${ids}-nombre-${asiento}`}>Nombre y apellido</Label>
                    <Input
                      id={`${ids}-nombre-${asiento}`}
                      autoFocus={i === 0}
                      autoComplete="off"
                      value={p.nombre}
                      aria-invalid={err.nombre ? true : undefined}
                      onChange={(e) => actualizarPasajero(asiento, "nombre", e.target.value)}
                    />
                    {err.nombre && <p className="text-sm text-destructive-text">{err.nombre}</p>}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${ids}-cedula-${asiento}`}>Cédula</Label>
                      <Input
                        id={`${ids}-cedula-${asiento}`}
                        autoComplete="off"
                        placeholder={`Ej.: ${CEDULA_PLACEHOLDER}`}
                        value={p.cedula}
                        aria-invalid={err.cedula ? true : undefined}
                        onChange={(e) => actualizarPasajero(asiento, "cedula", e.target.value)}
                        onBlur={(e) => {
                          if (cedulaValida(e.target.value)) actualizarPasajero(asiento, "cedula", formatearCedula(e.target.value));
                        }}
                      />
                      {err.cedula && <p className="text-sm text-destructive-text">{err.cedula}</p>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${ids}-telefono-${asiento}`}>Teléfono (opcional)</Label>
                      <Input
                        id={`${ids}-telefono-${asiento}`}
                        type="tel"
                        autoComplete="off"
                        placeholder={`Ej.: ${TELEFONO_PLACEHOLDER}`}
                        value={p.telefono}
                        onChange={(e) => actualizarPasajero(asiento, "telefono", e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>
              );
            })}
            <PiePaso>
              <Button type="button" variant="outline" onClick={() => irA("asiento")}>
                Atrás
              </Button>
              <Button type="submit">Continuar</Button>
            </PiePaso>
          </form>
        )}

        {step === "pago" && selectedViaje && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {asientos.length === 1 ? "1 boleto" : `${asientos.length} boletos`} · {asientos.length === 1 ? "asiento" : "asientos"}{" "}
              {listaAsientos(asientos)}
            </p>
            <CobroTaquillaForm
              totalUsd={totalUsd}
              enviando={isSubmitting}
              errorCampo={errorCobro}
              onCobrar={(d) => void handleCobrar(d)}
              onVolver={() => irA("pasajero")}
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
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Listo
                </Button>
                <Button variant="outline" onClick={reiniciar}>
                  Vender otro
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
        ruta: v?.ruta ? `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}` : "",
        trayecto: v?.ruta ? { origen: v.ruta.ciudad_origen, destino: v.ruta.ciudad_destino } : null,
        salida: v?.fecha_hora_salida ?? null,
        unidad: v?.numero_unidad ?? null,
      });
    } catch (err) {
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
        onCobrado?.();
        return;
      }
      if (res.codigo === "EB_ESTADO_CAMBIO" || res.codigo === "EB_PAGO_PENDIENTE_EXISTE") {
        // La reserva cambió de estado (otro compañero la cobró o el pasajero reportó un pago):
        // se cierra y el motivo queda en un aviso fuera del diálogo.
        avisarError(res.error);
        onCobrado?.();
        onOpenChange(false);
        return;
      }
      setErrorCobro(errorDeCobro(res) ?? { campo: null, mensaje: res.error });
    } catch (err) {
      setErrorCobro({ campo: null, mensaje: mensajeExcepcion(err, "cobrar la reserva") });
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
      <DialogContent tamano="flujo">
        <DialogHeader>
          <DialogTitle>{operacion ? "Reserva cobrada" : "Cobrar reserva"}</DialogTitle>
          <DialogDescription>
            {reserva
              ? `${reserva.asientos.length === 1 ? "1 boleto" : `${reserva.asientos.length} boletos`} · ${reserva.ruta}${
                  reserva.salida ? ` · ${formatSalidaVenta(reserva.salida)}` : ""
                } · ${reserva.asientos.length === 1 ? "asiento" : "asientos"} ${listaAsientos(reserva.asientos)}${
                  reserva.pasajero ? ` · ${reserva.pasajero}` : ""
                }`
              : "Reserva de la app"}
          </DialogDescription>
        </DialogHeader>

        {cargando && !reserva ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Cargando la reserva">
            <Skeleton className="h-20 w-full rounded-md" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
        ) : errorCarga && !reserva ? (
          <div className="flex flex-col gap-4">
            <ErrorState compacto titulo="No pudimos cargar la reserva" descripcion={errorCarga} onReintentar={cargar} />
            <div className="flex justify-start border-t border-border pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
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
