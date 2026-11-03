"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowClockwise, CheckCircle, Ticket, Users, Warning, XCircle, Clock, Bus, Printer,
} from "@phosphor-icons/react";
import type { Boleto, EstadoBoleto } from "@/lib/types/boletos";
import {
  getEstadoUiBoleto,
  type EstadoUiBoleto,
  type PagoResumen,
  type ResultadoEmbarque,
} from "@/lib/types/pagos";
import { VentaFlow, CobrarReservaDialog } from "@/components/boletos/venta-flow";
import { ScanInput } from "@/components/scan-input";
import { UltimoEscaneo, useUltimoEscaneo, type ResultadoEscaneo } from "@/components/ultimo-escaneo";
import { useImpresora } from "@/hooks/use-impresora";
import { PasajerosViajeSheet } from "@/components/boletos/pasajeros-viaje-sheet";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Monto } from "@/components/monto";
import { requireOnline } from "@/components/connectivity-banner";
import { Pagination } from "@/components/ui/pagination";
import { humanizeError } from "@/lib/errores";
import { formatFechaVE, formatHoraVE, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula } from "@/lib/ve";
import { formatCodigoBoleto, normalizarCodigoBoleto } from "@/lib/artefactos.generated";
import { cn } from "@/lib/utils";
import { confirmarEmbarque, validarEmbarque } from "./actions";

const LIMITE = 50;

type BoletoRow = Boleto & {
  comprador?: { nombre_completo: string } | null;
  pago?: PagoResumen | PagoResumen[] | null;
};

type ViajeHoy = {
  id: string;
  fecha_hora_salida: string;
  numero_unidad: string | null;
  estado: string;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
};

type Escaneo = { codigo: string; resultado: ResultadoEmbarque };

const SIN_BUS = "todos";

const FILTROS_ESTADO: Record<string, string> = {
  todos: "Todos",
  RESERVADO: "Apartados (sin pagar o por verificar)",
  PAGADO: "Pagados",
  USADO: "Embarcados",
  CANCELADO: "Cancelados",
  EXPIRADO: "Vencidos",
};

const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

function pagoDe(b: BoletoRow): PagoResumen | null {
  return (Array.isArray(b.pago) ? b.pago[0] : b.pago) ?? null;
}

function estadoUiDe(b: BoletoRow): EstadoUiBoleto {
  return getEstadoUiBoleto(b.estado as EstadoBoleto, pagoDe(b)?.estado_verificacion ?? null);
}

/** "08:00" (24 h, hora de Venezuela). */
function hora24(iso: string) {
  return formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "HOY 08:00", "MAÑANA 06:00", "AYER 08:00" o "sáb 05/10 06:00". */
function diaYHora(iso: string, dias: number) {
  const dia =
    dias === 0
      ? "HOY"
      : dias === 1
        ? "MAÑANA"
        : dias === -1
          ? "AYER"
          : formatFechaVE(iso, { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "");
  return `${dia} ${hora24(iso)}`;
}

/** "03/10 a las 7:52 a. m." */
function fechaYHora(iso: string) {
  return `${formatFechaVE(iso, { day: "2-digit", month: "2-digit" })} a las ${formatHoraVE(iso)}`;
}

/** "V12345678" / "v-12.345.678" -> "V-12.345.678" (para leer en voz alta en el andén). */
function cedulaLegible(cedula: string | null | undefined) {
  return cedula ? formatCedula(cedula) : null;
}

function etiquetaViaje(v: ViajeHoy) {
  const ruta = v.ruta ? `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}` : "Ruta";
  return `${hora24(v.fecha_hora_salida)} · ${ruta}${v.numero_unidad ? ` · Unidad ${v.numero_unidad}` : ""}`;
}

// ─── Diálogo del resultado del escaneo ──────────────────────────────────────

type Tono = "ok" | "alerta" | "error";

const TONOS: Record<Tono, { clase: string; Icono: typeof CheckCircle }> = {
  ok: { clase: "text-success-text", Icono: CheckCircle },
  alerta: { clase: "text-warning-text", Icono: Warning },
  error: { clase: "text-destructive-text", Icono: XCircle },
};

function ResultadoEmbarqueDialog({
  escaneo,
  viajesHoy,
  viajeElegido,
  confirmando,
  revalidando,
  onCerrar,
  onConfirmar,
  onRevalidar,
  onCobrar,
  onVender,
  onCambiarBus,
}: {
  escaneo: Escaneo | null;
  viajesHoy: ViajeHoy[];
  viajeElegido: ViajeHoy | null;
  confirmando: boolean;
  revalidando: boolean;
  onCerrar: () => void;
  onConfirmar: (boletoId: string) => void;
  onRevalidar: () => void;
  onCobrar: (boletoId: string) => void;
  onVender: (viajeId: string) => void;
  onCambiarBus: (viajeId: string) => void;
}) {
  // El diálogo de verificación embebido llama a onResuelto y luego a onOpenChange(false):
  // tras resolver no se cierra todo, se vuelve a validar el boleto.
  const resueltoRef = useRef(false);
  // Acción principal (Confirmar embarque, Cobrar ahora…): Enter la activa al abrir.
  const principalRef = useRef<HTMLButtonElement>(null);
  const r = escaneo?.resultado;

  let tono: Tono = "error";
  let titulo = "";
  let cuerpo: React.ReactNode = null;
  let acciones: React.ReactNode = (
    <Button variant="outline" onClick={onCerrar} autoFocus ref={principalRef}>
      Entendido
    </Button>
  );

  if (r && !("boleto" in r)) {
    titulo = r.resultado === "NO_ENCONTRADO" ? "Boleto no encontrado" : "Boleto de otra cooperativa";
    cuerpo = (
      <p className="text-sm">
        {r.resultado === "NO_ENCONTRADO" ? (
          <>
            No encontramos ningún boleto con el código <span className="font-mono font-medium">{formatCodigoBoleto(r.codigo)}</span>. Revisa
            que esté completo o escanéalo de nuevo.
          </>
        ) : (
          <>
            El boleto <span className="font-mono font-medium">{formatCodigoBoleto(r.codigo)}</span> es de otra cooperativa. El pasajero debe
            embarcar con esa empresa.
          </>
        )}
      </p>
    );
  } else if (r && "boleto" in r) {
    const { boleto, viaje, pago } = r;
    const ruta = `${formatCiudad(viaje.origen)} → ${formatCiudad(viaje.destino)}`;
    const pasajero = [boleto.pasajero_nombre || "Sin nombre", cedulaLegible(boleto.pasajero_cedula)].filter(Boolean).join(" · ");
    const resumen = (
      <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
        <p className="font-medium">
          {ruta} · {diaYHora(viaje.salida, r.dias_diferencia)}
          {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}
        </p>
        <p>
          Asiento <strong>{boleto.asiento}</strong> · {pasajero}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{formatCodigoBoleto(boleto.codigo_boleto)}</p>
      </div>
    );

    // El servidor revisa OTRO_VIAJE antes que OTRO_DIA: con un bus elegido, un boleto de
    // otro día llega como OTRO_VIAJE. Para el taquillero lo importante es que es de otro día.
    const resultado = r.resultado === "OTRO_VIAJE" && r.dias_diferencia !== 0 ? "OTRO_DIA" : r.resultado;

    switch (resultado) {
      case "VALIDO":
        tono = "ok";
        titulo = "Boleto válido";
        cuerpo = (
          <div className="space-y-2">
            <p className="text-lg font-semibold">
              Sale {diaYHora(viaje.salida, r.dias_diferencia)} · {ruta}
              {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}
            </p>
            <p className="text-lg">
              Asiento <strong className="text-2xl">{boleto.asiento}</strong> · {pasajero}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{formatCodigoBoleto(boleto.codigo_boleto)}</p>
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" onClick={onCerrar} disabled={confirmando}>
              No embarcar
            </Button>
            <Button
              autoFocus
              ref={principalRef}
              onClick={() => onConfirmar(boleto.id)}
              disabled={confirmando}
            >
              {confirmando && <Spinner className="mr-2 h-4 w-4" />}
              {confirmando ? "Embarcando…" : "Confirmar embarque"}
            </Button>
          </>
        );
        break;

      case "OTRO_DIA":
        titulo = "Este boleto es para otro día";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              {r.dias_diferencia > 0
                ? `Viaje del ${r.dias_diferencia === 1 ? "MAÑANA" : formatFechaVE(viaje.salida, { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "")} a las ${hora24(viaje.salida)}. No lo embarques en este bus.`
                : `Este boleto era para el viaje del ${formatFechaVE(viaje.salida, { day: "2-digit", month: "2-digit" })} ${hora24(viaje.salida)}, que ya salió. No lo embarques en este bus.`}
            </p>
            {resumen}
          </div>
        );
        break;

      case "OTRO_VIAJE": {
        titulo = "Este boleto es de otro bus";
        const suBus = viajesHoy.find((v) => v.id === viaje.id);
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              Es para {ruta} · {diaYHora(viaje.salida, r.dias_diferencia)}
              {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}.
              {viajeElegido ? ` Estás embarcando ${etiquetaViaje(viajeElegido)}.` : ""} No lo embarques en este bus.
            </p>
            {resumen}
          </div>
        );
        if (suBus) {
          acciones = (
            <>
              <Button variant="outline" onClick={onCerrar} autoFocus ref={principalRef}>
                Entendido
              </Button>
              <Button variant="secondary" onClick={() => onCambiarBus(suBus.id)} disabled={revalidando}>
                Cambiar a ese bus
              </Button>
            </>
          );
        }
        break;
      }

      case "PAGO_EN_VERIFICACION":
        tono = "alerta";
        titulo = "Pago por verificar";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-sm">
              El pasajero registró un pago desde la app que todavía nadie verificó. Compáralo con tu banco: si lo
              apruebas, podrás embarcarlo de inmediato.
            </p>
            {resumen}
            {pago && (
              <VerificarPagoDialog
                embebido
                open
                pagoId={pago.id}
                onResuelto={() => {
                  resueltoRef.current = true;
                  onRevalidar();
                }}
                onOpenChange={(abierto) => {
                  if (abierto) return;
                  if (resueltoRef.current) {
                    resueltoRef.current = false;
                    return;
                  }
                  onCerrar();
                }}
              />
            )}
          </div>
        );
        acciones = (
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar sin embarcar
          </Button>
        );
        break;

      case "RESERVA_SIN_PAGAR":
        tono = "alerta";
        titulo = "Reserva sin pagar";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              El pasajero apartó el asiento pero no ha pagado.
              {boleto.reserva_expira_at ? ` Vence a las ${hora24(boleto.reserva_expira_at)}.` : ""}
            </p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" onClick={onCerrar}>
              No embarcar
            </Button>
            <Button autoFocus ref={principalRef} onClick={() => onCobrar(boleto.id)}>
              Cobrar ahora
            </Button>
          </>
        );
        break;

      case "PAGO_RECHAZADO":
        titulo = "Pago rechazado";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">{pago?.motivo_rechazo || "La cooperativa rechazó el pago que registró el pasajero."}</p>
            <p className="text-sm text-muted-foreground">Cobra el pasaje en taquilla para poder embarcarlo.</p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" onClick={onCerrar}>
              No embarcar
            </Button>
            <Button autoFocus ref={principalRef} onClick={() => onCobrar(boleto.id)}>
              Cobrar ahora
            </Button>
          </>
        );
        break;

      case "EXPIRADO":
        titulo = "Reserva vencida";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              Reserva vencida: el asiento se liberó. Si el pasajero aún quiere viajar, véndele un boleto nuevo.
            </p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button autoFocus ref={principalRef} onClick={() => onVender(viaje.id)}>
              Vender boleto
            </Button>
          </>
        );
        break;

      case "CANCELADO":
        titulo = "Boleto cancelado";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              Este boleto se canceló{boleto.updated_at ? ` el ${fechaYHora(boleto.updated_at)}` : ""}. No lo embarques.
            </p>
            {boleto.motivo_cancelacion && (
              <p className="text-sm">
                <span className="text-muted-foreground">Motivo:</span> {boleto.motivo_cancelacion}
              </p>
            )}
            {resumen}
          </div>
        );
        break;

      case "USADO": {
        const cuando = boleto.embarcado_at ?? boleto.updated_at;
        titulo = "Boleto ya usado";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              Este boleto ya se usó para embarcar{cuando ? ` el ${fechaYHora(cuando)}` : ""}.
            </p>
            {resumen}
          </div>
        );
        break;
      }

      case "VIAJE_CANCELADO":
        titulo = "Viaje cancelado";
        cuerpo = (
          <div className="space-y-3">
            <p className="text-base font-medium">
              El viaje de este boleto fue cancelado. No lo embarques: envía al pasajero a la taquilla para cambiar su
              boleto o devolverle el dinero.
            </p>
            {resumen}
          </div>
        );
        break;
    }
  }

  const { clase, Icono } = TONOS[tono];

  return (
    <Dialog open={!!escaneo} onOpenChange={(abierto) => !abierto && !confirmando && onCerrar()}>
      <DialogContent
        initialFocus={principalRef}
        className={cn(
          "max-h-[92vh] overflow-y-auto sm:max-w-lg",
          tono === "ok" && "border-success/40",
          tono === "error" && "border-destructive/40",
          tono === "alerta" && "border-warning/40"
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2 text-xl", clase)}>
            <Icono weight="fill" className="size-6 shrink-0" aria-hidden />
            {titulo}
          </DialogTitle>
          <DialogDescription className="sr-only">Resultado del escaneo del boleto</DialogDescription>
        </DialogHeader>
        {revalidando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner size="sm" /> Revisando el boleto de nuevo…
          </div>
        ) : (
          cuerpo
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">{acciones}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Último escaneo ─────────────────────────────────────────────────────────

const TITULO_RESULTADO: Record<string, { titulo: string; tono: ResultadoEscaneo["tono"] }> = {
  NO_ENCONTRADO: { titulo: "Boleto no encontrado", tono: "error" },
  OTRA_COOPERATIVA: { titulo: "Boleto de otra cooperativa", tono: "error" },
  OTRO_DIA: { titulo: "Boleto de otro día", tono: "error" },
  OTRO_VIAJE: { titulo: "Boleto de otro viaje", tono: "error" },
  PAGO_EN_VERIFICACION: { titulo: "Pago sin verificar", tono: "aviso" },
  RESERVA_SIN_PAGAR: { titulo: "Reserva sin pagar", tono: "aviso" },
  PAGO_RECHAZADO: { titulo: "Pago rechazado", tono: "error" },
  EXPIRADO: { titulo: "Reserva vencida", tono: "error" },
  CANCELADO: { titulo: "Boleto cancelado", tono: "error" },
  USADO: { titulo: "Ya embarcó", tono: "error" },
  VIAJE_CANCELADO: { titulo: "Viaje cancelado", tono: "error" },
};

/** "Asiento 14 · Ana Pérez" */
function asientoYPasajero(boleto: { asiento: string; pasajero_nombre: string | null }) {
  return `Asiento ${boleto.asiento} · ${boleto.pasajero_nombre || "Sin nombre"}`;
}

/**
 * Resultado del escaneo para el panel "Último escaneo" (con sonido). Un boleto
 * válido no se registra aquí: se registra al confirmar el embarque.
 */
function escaneoDeResultado(codigo: string, r: ResultadoEmbarque): Omit<ResultadoEscaneo, "at"> | null {
  if (r.resultado === "VALIDO") return null;
  const tipo = "boleto" in r && r.resultado === "OTRO_VIAJE" && r.dias_diferencia !== 0 ? "OTRO_DIA" : r.resultado;
  const { titulo, tono } = TITULO_RESULTADO[tipo] ?? { titulo: "No se puede embarcar", tono: "error" as const };
  return {
    codigo: formatCodigoBoleto("boleto" in r ? r.boleto.codigo_boleto : codigo),
    tono,
    titulo,
    detalle: "boleto" in r ? asientoYPasajero(r.boleto) : undefined,
  };
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function TaquillaBoletosPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [boletos, setBoletos] = useState<BoletoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroFecha, setFiltroFecha] = useState<string>("");

  const [showVentaFlow, setShowVentaFlow] = useState(false);
  const [ventaViajeInicial, setVentaViajeInicial] = useState<string | null>(null);
  const [pagoAVerificar, setPagoAVerificar] = useState<string | null>(null);
  const [reservaACobrar, setReservaACobrar] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [pasajerosSheetViaje, setPasajerosSheetViaje] = useState<{ id: string; ruta: string; salida: string | null } | null>(null);

  // Embarque
  const [viajesHoy, setViajesHoy] = useState<ViajeHoy[]>([]);
  const [viajeEmbarque, setViajeEmbarque] = useState<string>(SIN_BUS);
  const [cargandoViajesHoy, setCargandoViajesHoy] = useState(true);
  const [escaneo, setEscaneo] = useState<Escaneo | null>(null);
  const [validando, setValidando] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const { ultimo, registrar } = useUltimoEscaneo();
  // Reconecta la impresora guardada al abrir la taquilla (#53).
  const impresora = useImpresora();
  const validandoRef = useRef(false);

  // Última carga: una respuesta vieja (otro filtro) no pisa la de una carga posterior.
  const cargaRef = useRef(0);
  const fetchBoletos = useCallback(async () => {
    const carga = ++cargaRef.current;
    setLoading(true);
    setErrorCarga(null);
    setCurrentPage(1);
    try {
      let query = supabase
        .from("boletos")
        .select(`
          id, codigo_boleto, asiento, precio, estado, created_at, compra_id, reserva_expira_at,
          pasajero_nombre, pasajero_cedula,
          comprador:profiles!comprador_id(nombre_completo),
          viaje:viajes!viaje_id(
            id,
            fecha_hora_salida,
            numero_unidad,
            ruta:rutas!ruta_id(ciudad_origen, estado_origen, ciudad_destino, estado_destino)
          ),
          pago:pagos!boletos_pago_id_fkey(id, estado_verificacion, tipo_pago, monto, monto_bs, moneda)
        `)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(LIMITE);

      if (filtroEstado !== "todos") {
        query = query.eq("estado", filtroEstado);
      }

      if (filtroFecha) {
        // Filtra por la fecha de SALIDA del viaje (no por la de venta), con el día
        // completo en hora de Venezuela.
        const { desde, hasta } = rangoDiaVE(filtroFecha);
        const { data: viajesDia, error: viajesError } = await supabase
          .from("viajes")
          .select("id")
          .eq("cooperativa_id", cooperativaId)
          .gte("fecha_hora_salida", desde)
          .lte("fecha_hora_salida", hasta);

        if (viajesError) throw viajesError;
        if (carga !== cargaRef.current) return;
        const viajeIds = (viajesDia ?? []).map((v: { id: string }) => v.id);
        if (viajeIds.length === 0) {
          setBoletos([]);
          return;
        }
        query = query.in("viaje_id", viajeIds);
      }

      const { data, error } = await query;
      if (carga !== cargaRef.current) return;
      if (error) throw error;
      setBoletos(data as unknown as BoletoRow[]);
    } catch (err) {
      console.error(err);
      if (carga === cargaRef.current) setErrorCarga(humanizeError(err, "cargar los boletos"));
    } finally {
      if (carga === cargaRef.current) setLoading(false);
    }
  }, [supabase, cooperativaId, filtroEstado, filtroFecha]);

  const fetchViajesHoy = useCallback(async () => {
    setCargandoViajesHoy(true);
    try {
      const { desde, hasta } = rangoDiaVE(hoyVE());
      const { data, error } = await supabase
        .from("viajes")
        .select("id, fecha_hora_salida, numero_unidad, estado, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)")
        .eq("cooperativa_id", cooperativaId)
        .in("estado", ["PROGRAMADO", "EN_CURSO"])
        .gte("fecha_hora_salida", desde)
        .lte("fecha_hora_salida", hasta)
        .order("fecha_hora_salida", { ascending: true });
      if (error) throw error;
      const lista = (data ?? []) as unknown as ViajeHoy[];
      setViajesHoy(lista);
      // Por defecto, el próximo bus (o uno que salió hace menos de 30 minutos y aún embarca).
      setViajeEmbarque((actual) => {
        if (actual !== SIN_BUS && lista.some((v) => v.id === actual)) return actual;
        const limite = Date.now() - 30 * 60 * 1000;
        const proximo = lista.find((v) => new Date(v.fecha_hora_salida).getTime() >= limite) ?? lista[lista.length - 1];
        return proximo?.id ?? SIN_BUS;
      });
    } catch (err) {
      console.error(err);
      toast.error(humanizeError(err, "cargar los viajes de hoy"));
    } finally {
      setCargandoViajesHoy(false);
    }
  }, [supabase, cooperativaId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void fetchBoletos();
  }, [fetchBoletos]);

  useEffect(() => {
    void fetchViajesHoy();
  }, [fetchViajesHoy]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const viajeElegido = viajesHoy.find((v) => v.id === viajeEmbarque) ?? null;
  const viajeParaValidar = viajeEmbarque === SIN_BUS ? null : viajeEmbarque;

  const validar = useCallback(
    async (codigo: string, viajeId: string | null, esRevalidacion = false) => {
      if (validandoRef.current) return;
      validandoRef.current = true;
      if (esRevalidacion) setRevalidando(true);
      else setValidando(true);
      try {
        const res = await requireOnline(() => validarEmbarque(codigo, viajeId))();
        if (res.success) {
          setEscaneo({ codigo, resultado: res.data });
          if (!esRevalidacion) {
            const resumen = escaneoDeResultado(codigo, res.data);
            if (resumen) registrar(resumen);
          }
        } else {
          if (esRevalidacion) {
            toast.error(res.error);
            setEscaneo(null);
          } else {
            registrar({ codigo: formatCodigoBoleto(codigo), tono: "error", titulo: "No pudimos revisar el boleto", detalle: res.error });
          }
        }
      } catch (err) {
        console.error(err);
        const mensaje = mensajeExcepcion(err, "revisar el boleto");
        if (esRevalidacion) toast.error(mensaje);
        else registrar({ codigo: formatCodigoBoleto(codigo), tono: "error", titulo: "No pudimos revisar el boleto", detalle: mensaje });
      } finally {
        validandoRef.current = false;
        setValidando(false);
        setRevalidando(false);
      }
    },
    [registrar]
  );

  const handleCodigo = (codigo: string) => {
    // Con o sin guiones, espacios, minúsculas o "PASS-": la forma guardada (BOL-7CABE4AD).
    void validar(normalizarCodigoBoleto(codigo), viajeParaValidar);
  };

  const revalidar = () => {
    if (escaneo) void validar(escaneo.codigo, viajeParaValidar, true);
  };

  const handleConfirmarEmbarque = async (boletoId: string) => {
    if (!escaneo || confirmando) return;
    setConfirmando(true);
    try {
      const res = await requireOnline(() => confirmarEmbarque(boletoId, viajeParaValidar))();
      if (res.success) {
        const r = res.data;
        registrar({
          codigo: formatCodigoBoleto("boleto" in r ? r.boleto.codigo_boleto : escaneo.codigo),
          tono: "exito",
          titulo: "Embarcado",
          detalle: "boleto" in r ? asientoYPasajero(r.boleto) : undefined,
        });
        setEscaneo(null);
        void fetchBoletos();
      } else if (res.resultado) {
        // Dejó de ser válido entre el escaneo y la confirmación: mostrar la causa.
        const resumen = escaneoDeResultado(escaneo.codigo, res.resultado);
        if (resumen) registrar(resumen);
        else toast.error(res.error);
        setEscaneo({ codigo: escaneo.codigo, resultado: res.resultado });
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      console.error(err);
      toast.error(mensajeExcepcion(err, "confirmar el embarque"));
    } finally {
      setConfirmando(false);
    }
  };

  const abrirVenta = (viajeId: string | null = null) => {
    setVentaViajeInicial(viajeId);
    setShowVentaFlow(true);
  };

  const formatDate = (dateString: string) =>
    formatFechaVE(dateString, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) || dateString;

  const totalPages = Math.ceil(boletos.length / itemsPerPage);
  const paginatedBoletos = boletos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const algunDialogo = showVentaFlow || !!escaneo || !!pagoAVerificar || !!reservaACobrar || !!pasajerosSheetViaje;

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader title="Taquilla de boletos" description="Vende boletos, cobra reservas de la app y embarca pasajeros.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => abrirVenta()}>
            <Ticket className="w-4 h-4 mr-2" aria-hidden />
            Vender boletos
          </Button>
          {impresora.estado !== "no-soportado" && (
            <Link href="/cooperativas/hardware" className={buttonVariants({ variant: "outline" })}>
              <Printer className="w-4 h-4 mr-2" aria-hidden />
              {impresora.estado === "conectada"
                ? "Impresora conectada"
                : impresora.estado === "reconectando"
                  ? "Reconectando impresora…"
                  : "Conectar impresora"}
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Embarque */}
      <section aria-labelledby="titulo-embarque" className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="titulo-embarque" className="font-semibold flex items-center gap-2">
              <Bus className="size-5" aria-hidden />
              Embarque
            </h2>
            <p className="text-sm text-muted-foreground">Escanea el boleto de cada pasajero antes de que suba al bus.</p>
          </div>
          <div className="space-y-1.5 w-full sm:w-[360px]">
            <Label htmlFor="bus-embarque" className="text-sm text-muted-foreground">
              ¿Qué bus estás embarcando?
            </Label>
            <div className="flex gap-2">
              <Select
                value={viajeEmbarque}
                onValueChange={(v) => setViajeEmbarque(v ?? SIN_BUS)}
                items={{
                  [SIN_BUS]: "Cualquier bus de hoy (sin comparar)",
                  ...Object.fromEntries(viajesHoy.map((v) => [v.id, etiquetaViaje(v)])),
                }}
              >
                <SelectTrigger id="bus-embarque" className="w-full" disabled={cargandoViajesHoy}>
                  <SelectValue placeholder={cargandoViajesHoy ? "Cargando viajes de hoy…" : "Elige el bus"} />
                </SelectTrigger>
                <SelectContent>
                  {viajesHoy.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {etiquetaViaje(v)}
                    </SelectItem>
                  ))}
                  <SelectItem value={SIN_BUS}>Cualquier bus de hoy (sin comparar)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void fetchViajesHoy()}
                disabled={cargandoViajesHoy}
                aria-label="Actualizar los viajes de hoy"
                title="Actualizar los viajes de hoy"
              >
                <ArrowClockwise />
              </Button>
            </div>
          </div>
        </div>

        {!cargandoViajesHoy && viajesHoy.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay viajes de hoy por embarcar. Puedes escanear igual: verás para qué viaje es cada boleto.
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="space-y-2">
            <ScanInput onCodigo={handleCodigo} cooperativaId={cooperativaId} mode="boletos" disabled={algunDialogo || validando} />
            <div className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
              {validando && (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Revisando el boleto…
                </span>
              )}
            </div>
          </div>
          <UltimoEscaneo resultado={ultimo} />
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="space-y-1.5 w-full sm:w-[280px]">
          <Label htmlFor="filtro-estado" className="text-sm font-medium text-muted-foreground">Estado</Label>
          <Select value={filtroEstado} onValueChange={(val) => setFiltroEstado(val ?? "todos")} items={FILTROS_ESTADO}>
            <SelectTrigger id="filtro-estado" className="w-full">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILTROS_ESTADO).map(([valor, texto]) => (
                <SelectItem key={valor} value={valor}>{texto}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-[200px]">
          <Label htmlFor="filtro-fecha-viaje" className="text-sm font-medium text-muted-foreground">Fecha del viaje</Label>
          <Input
            id="filtro-fecha-viaje"
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
        </div>

        {(filtroEstado !== "todos" || filtroFecha) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFiltroEstado("todos");
              setFiltroFecha("");
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Viaje</TableHead>
                <TableHead>Pasajero</TableHead>
                <TableHead>Asiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex items-center justify-center">
                      <Spinner size="md" />
                      <span className="ml-3 text-muted-foreground font-medium">Cargando boletos…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : errorCarga ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-sm text-destructive-text">{errorCarga}</span>
                      <Button variant="outline" size="sm" onClick={() => void fetchBoletos()}>
                        <ArrowClockwise className="mr-2" />
                        Reintentar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : boletos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {filtroEstado !== "todos" || filtroFecha
                      ? "No hay boletos con estos filtros."
                      : "Todavía no hay boletos. Usa «Vender boletos» para emitir el primero."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBoletos.map((boleto) => {
                  const origen = formatCiudad(boleto.viaje?.ruta?.ciudad_origen);
                  const destino = formatCiudad(boleto.viaje?.ruta?.ciudad_destino);
                  const rutaString = origen && destino ? `${origen} → ${destino}` : "Ruta desconocida";
                  const salida = boleto.viaje?.fecha_hora_salida ?? null;
                  const nombrePasajero = boleto.pasajero_nombre || boleto.comprador?.nombre_completo || "Sin nombre";
                  const ui = estadoUiDe(boleto);
                  const pago = pagoDe(boleto);

                  return (
                    <TableRow key={boleto.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono font-medium text-primary-text">
                        {formatCodigoBoleto(boleto.codigo_boleto)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{rutaString}</span>
                          <span className="text-xs text-muted-foreground mb-1">{salida ? formatDate(salida) : ""}</span>
                          {boleto.viaje?.id && (
                            <button
                              type="button"
                              className="text-xs text-primary-text hover:underline text-left inline-flex items-center"
                              onClick={() => setPasajerosSheetViaje({ id: boleto.viaje!.id, ruta: rutaString, salida })}
                            >
                              <Users className="w-3 h-3 mr-1" aria-hidden />
                              Ver pasajeros
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{nombrePasajero}</span>
                          {boleto.pasajero_cedula && (
                            <span className="text-xs text-muted-foreground">{formatCedula(boleto.pasajero_cedula)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium bg-muted px-2 py-1 rounded-md text-xs tabular-nums">
                          {boleto.asiento}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 items-start">
                          <StatusBadge status={ui} dominio="boleto" />
                          {ui === "RESERVA_SIN_PAGAR" && boleto.reserva_expira_at && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="size-3" aria-hidden />
                              Vence {formatHoraVE(boleto.reserva_expira_at)}
                            </span>
                          )}
                          {ui === "PAGO_EN_VERIFICACION" && pago && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-primary/50 text-primary-text hover:bg-primary/10"
                              onClick={() => setPagoAVerificar(pago.id)}
                            >
                              Validar pago
                            </Button>
                          )}
                          {(ui === "RESERVA_SIN_PAGAR" || ui === "PAGO_RECHAZADO") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setReservaACobrar(boleto.id)}
                            >
                              Cobrar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Monto usd={boleto.precio} align="right" size="sm" />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && boletos.length >= LIMITE && (
          <p className="text-xs text-muted-foreground">
            Se muestran los {LIMITE} boletos más recientes. Usa los filtros para encontrar otros.
          </p>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      <VentaFlow
        isOpen={showVentaFlow}
        viajeIdInicial={ventaViajeInicial}
        onClose={() => {
          setShowVentaFlow(false);
          setVentaViajeInicial(null);
          void fetchBoletos(); // Refresh table when flow closes
        }}
      />

      {/* Mientras se cobra la reserva escaneada, el resultado se oculta y luego se revalida. */}
      <ResultadoEmbarqueDialog
        escaneo={reservaACobrar ? null : escaneo}
        viajesHoy={viajesHoy}
        viajeElegido={viajeElegido}
        confirmando={confirmando}
        revalidando={revalidando}
        onCerrar={() => setEscaneo(null)}
        onConfirmar={(id) => void handleConfirmarEmbarque(id)}
        onRevalidar={revalidar}
        onCobrar={(id) => setReservaACobrar(id)}
        onVender={(viajeId) => {
          setEscaneo(null);
          abrirVenta(viajeId);
        }}
        onCambiarBus={(viajeId) => {
          setViajeEmbarque(viajeId);
          if (escaneo) void validar(escaneo.codigo, viajeId, true);
        }}
      />

      <CobrarReservaDialog
        boletoId={reservaACobrar}
        open={!!reservaACobrar}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setReservaACobrar(null);
            // Si se cobró desde el embarque, se vuelve a validar para ofrecer el embarque.
            if (escaneo) revalidar();
          }
        }}
        onCobrado={() => void fetchBoletos()}
      />

      {pagoAVerificar && (
        <VerificarPagoDialog
          pagoId={pagoAVerificar}
          open
          onOpenChange={(abierto) => !abierto && setPagoAVerificar(null)}
          onResuelto={() => void fetchBoletos()}
        />
      )}

      <PasajerosViajeSheet
        isOpen={!!pasajerosSheetViaje}
        onClose={() => setPasajerosSheetViaje(null)}
        viajeId={pasajerosSheetViaje?.id || null}
        rutaString={pasajerosSheetViaje?.ruta || ""}
        salida={pasajerosSheetViaje?.salida ?? null}
      />
    </div>
  );
}
