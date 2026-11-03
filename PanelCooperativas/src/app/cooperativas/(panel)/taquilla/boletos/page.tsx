"use client";

// ─── Taquilla de boletos ────────────────────────────────────────────────────
// Embarque (escáner + resultado), venta y lista de boletos. La pestaña de
// estado (`?estado=`), el día (`?fecha=`), la página y el viaje abierto en su
// hoja (`?viaje=`) viven en la URL.

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useUser } from "@/hooks/use-user";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import { ArrowClockwise, CheckCircle, Plus, Warning, XCircle } from "@phosphor-icons/react";
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
import { ViajeSheet } from "@/components/viajes/viaje-sheet";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Monto } from "@/components/monto";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { requireOnline } from "@/components/connectivity-banner";
import { avisarError } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { formatDiaVE, formatFechaHoraCortaVE, formatHoraVE, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula } from "@/lib/ve";
import { formatCodigoBoleto, normalizarCodigoBoleto } from "@/lib/artefactos.generated";
import { cn } from "@/lib/utils";
import { confirmarEmbarque, validarEmbarque } from "./actions";

const LIMITE = 100;
const COLUMNAS = 7;

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
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pestañas de estado (PN-08): valor = estado visible del boleto. */
const PESTANAS_ESTADO: Array<{ valor: string; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  ...(["RESERVA_SIN_PAGAR", "PAGO_EN_VERIFICACION", "PAGADO", "USADO"] as const).map((e) => ({
    valor: e,
    etiqueta: etiquetaEstado("boleto", e),
  })),
];

/** Estado guardado en la base para cada pestaña (las dos de reserva se separan por el pago). */
const ESTADO_BD: Record<string, EstadoBoleto> = {
  RESERVA_SIN_PAGAR: "RESERVADO",
  PAGO_EN_VERIFICACION: "RESERVADO",
  PAGADO: "PAGADO",
  USADO: "USADO",
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

/** "2:30 p. m." (hora de Venezuela, D4). */
function hora24(iso: string) {
  return formatHoraVE(iso);
}

/** "Hoy · 8:00 a. m.", "Mañana · 6:00 a. m.", "Ayer · …" o "05/10 · 6:00 a. m.". */
function diaYHora(iso: string, dias: number) {
  if (dias === 0) return `Hoy · ${hora24(iso)}`;
  if (dias === 1) return `Mañana · ${hora24(iso)}`;
  if (dias === -1) return `Ayer · ${hora24(iso)}`;
  return formatFechaHoraCortaVE(iso);
}

/** "03/10 · 7:52 a. m." */
function fechaYHora(iso: string) {
  return formatFechaHoraCortaVE(iso);
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
      Cerrar
    </Button>
  );

  if (r && !("boleto" in r)) {
    titulo = r.resultado === "NO_ENCONTRADO" ? "Boleto no encontrado" : "Boleto de otra cooperativa";
    cuerpo = (
      <p className="text-sm">
        {r.resultado === "NO_ENCONTRADO" ? (
          <>
            No encontramos el boleto <span className="font-mono font-medium">{formatCodigoBoleto(r.codigo)}</span>. Revisa que esté
            completo o escanéalo de nuevo.
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
      <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
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
          <div className="flex flex-col gap-2">
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
              {confirmando && <Spinner size="sm" />}
              {confirmando ? "Embarcando…" : "Confirmar embarque"}
            </Button>
          </>
        );
        break;

      case "OTRO_DIA":
        titulo = "Este boleto es para otro día";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              {r.dias_diferencia > 0
                ? `Es para el viaje de ${r.dias_diferencia === 1 ? "mañana" : `el ${formatDiaVE(viaje.salida)}`} a las ${hora24(viaje.salida)}. No lo embarques en este bus.`
                : `Era para el viaje del ${formatDiaVE(viaje.salida)} a las ${hora24(viaje.salida)}, que ya salió. No lo embarques.`}
            </p>
            {resumen}
          </div>
        );
        break;

      case "OTRO_VIAJE": {
        titulo = "Este boleto es de otro bus";
        const suBus = viajesHoy.find((v) => v.id === viaje.id);
        cuerpo = (
          <div className="flex flex-col gap-3">
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
              <Button variant="outline" onClick={onCerrar}>
                Cerrar
              </Button>
              <Button autoFocus ref={principalRef} onClick={() => onCambiarBus(suBus.id)} disabled={revalidando}>
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
          <div className="flex flex-col gap-3">
            <p className="text-sm">Compáralo con tu banco: si lo apruebas, lo embarcas de inmediato.</p>
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
          <Button variant="outline" onClick={onCerrar}>
            Cerrar sin embarcar
          </Button>
        );
        break;

      case "RESERVA_SIN_PAGAR":
        tono = "alerta";
        titulo = "Reserva sin pagar";
        cuerpo = (
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">El asiento se liberó. Si aún quiere viajar, véndele un boleto nuevo.</p>
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
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              El viaje de este boleto se canceló. No lo embarques: envíalo a la taquilla para cambiar el boleto o
              devolverle el dinero.
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
          tono === "ok" && "border-success/40",
          tono === "error" && "border-destructive/40",
          tono === "alerta" && "border-warning/40"
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2 text-lg", clase)}>
            <Icono weight="fill" className="size-6 shrink-0" aria-hidden />
            {titulo}
          </DialogTitle>
          <DialogDescription className="sr-only">Resultado del escaneo del boleto</DialogDescription>
        </DialogHeader>
        {revalidando ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Revisando el boleto de nuevo">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : (
          cuerpo
        )}
        <DialogFooter className="sm:justify-between">{acciones}</DialogFooter>
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
  // useSearchParams (?estado=, ?fecha=, ?viaje=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-48 w-full rounded-md" />
          <TablaSkeleton columnas={COLUMNAS} conFiltros />
        </div>
      }
    >
      <TaquillaBoletos />
    </Suspense>
  );
}

function TaquillaBoletos() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [boletos, setBoletos] = useState<BoletoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros y viaje abierto en la URL
  const [estadoUrl] = useParamUrl("estado", "todos");
  const filtroEstado = PESTANAS_ESTADO.some((p) => p.valor === estadoUrl) ? estadoUrl : "todos";
  const [fechaUrl] = useParamUrl("fecha");
  const filtroFecha = FECHA_RE.test(fechaUrl) ? fechaUrl : "";
  const [viajeAbierto] = useParamUrl("viaje");
  const cambiarParams = useCambiarParams();
  const abrirViaje = (id: string | null) => cambiarParams({ viaje: id }, { conservarPagina: true });

  const [showVentaFlow, setShowVentaFlow] = useState(false);
  const [ventaViajeInicial, setVentaViajeInicial] = useState<string | null>(null);
  const [pagoAVerificar, setPagoAVerificar] = useState<string | null>(null);
  const [reservaACobrar, setReservaACobrar] = useState<string | null>(null);

  // Embarque
  const [viajesHoy, setViajesHoy] = useState<ViajeHoy[]>([]);
  const [viajeEmbarque, setViajeEmbarque] = useState<string>(SIN_BUS);
  const [cargandoViajesHoy, setCargandoViajesHoy] = useState(true);
  const [escaneo, setEscaneo] = useState<Escaneo | null>(null);
  const [validando, setValidando] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const { ultimo, registrar } = useUltimoEscaneo();
  const validandoRef = useRef(false);

  const fetchBoletos = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
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
        query = query.eq("estado", ESTADO_BD[filtroEstado]);
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
        const viajeIds = (viajesDia ?? []).map((v: { id: string }) => v.id);
        if (viajeIds.length === 0) {
          setBoletos([]);
          return;
        }
        query = query.in("viaje_id", viajeIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      let filas = data as unknown as BoletoRow[];
      // "Reserva sin pagar" y "Pago por verificar" comparten estado en la base: los separa el pago.
      if (filtroEstado === "RESERVA_SIN_PAGAR" || filtroEstado === "PAGO_EN_VERIFICACION") {
        filas = filas.filter((b) => estadoUiDe(b) === filtroEstado);
      }
      setBoletos(filas);
    } catch (err) {
      setErrorCarga(humanizeError(err, "cargar los boletos"));
    } finally {
      setLoading(false);
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
      avisarError(humanizeError(err, "cargar los viajes de hoy"));
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
        } else if (esRevalidacion) {
          avisarError(res.error);
          setEscaneo(null);
        } else {
          registrar({ codigo: formatCodigoBoleto(codigo), tono: "error", titulo: "No pudimos revisar el boleto", detalle: res.error });
        }
      } catch (err) {
        const mensaje = mensajeExcepcion(err, "revisar el boleto");
        if (esRevalidacion) avisarError(mensaje);
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
        else avisarError(res.error);
        setEscaneo({ codigo: escaneo.codigo, resultado: res.resultado });
      } else {
        avisarError(res.error);
      }
    } catch (err) {
      avisarError(mensajeExcepcion(err, "confirmar el embarque"));
    } finally {
      setConfirmando(false);
    }
  };

  const abrirVenta = (viajeId: string | null = null) => {
    setVentaViajeInicial(viajeId);
    setShowVentaFlow(true);
  };

  const { visibles, pagina, paginas, ir } = usePaginacion(boletos);
  const algunDialogo = showVentaFlow || !!escaneo || !!pagoAVerificar || !!reservaACobrar || !!viajeAbierto;
  const hayFiltros = filtroEstado !== "todos" || Boolean(filtroFecha);
  const IconoEmbarque = ICONO_SECCION.escanear;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Taquilla de boletos">
        <Button onClick={() => abrirVenta()}>
          <ICONO_SECCION.taquillaBoletos aria-hidden />
          Vender boletos
        </Button>
      </PageHeader>

      {/* Embarque */}
      <Card role="region" aria-labelledby="titulo-embarque" className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 id="titulo-embarque" className="flex items-center gap-2 text-lg font-semibold">
            <IconoEmbarque className="size-5 text-muted-foreground" aria-hidden />
            Embarque
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-[360px]">
            <Label htmlFor="bus-embarque">¿Qué bus estás embarcando?</Label>
            <div className="flex gap-2">
              <Select
                value={viajeEmbarque}
                onValueChange={(v) => setViajeEmbarque(v ?? SIN_BUS)}
                items={{
                  [SIN_BUS]: "Cualquier bus de hoy",
                  ...Object.fromEntries(viajesHoy.map((v) => [v.id, etiquetaViaje(v)])),
                }}
              >
                <SelectTrigger id="bus-embarque" className="w-full min-w-0 flex-1" disabled={cargandoViajesHoy}>
                  <SelectValue placeholder="Elige el bus" />
                </SelectTrigger>
                <SelectContent>
                  {viajesHoy.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {etiquetaViaje(v)}
                    </SelectItem>
                  ))}
                  <SelectItem value={SIN_BUS}>Cualquier bus de hoy</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => void fetchViajesHoy()}
                disabled={cargandoViajesHoy}
                aria-label="Actualizar los viajes de hoy"
                title="Actualizar los viajes de hoy"
              >
                {cargandoViajesHoy ? <Spinner size="sm" /> : <ArrowClockwise aria-hidden />}
              </Button>
            </div>
            {!cargandoViajesHoy && viajesHoy.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay viajes por embarcar hoy.</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex flex-col gap-2">
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
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <TabsUrl param="estado" defecto="todos" opciones={PESTANAS_ESTADO} />
          <BarraFiltros fechas={[{ param: "fecha", etiqueta: "Fecha del viaje" }]} />
        </div>

        {loading && boletos.length === 0 ? (
          <TablaSkeleton columnas={COLUMNAS} />
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {errorCarga ? (
              <ErrorState titulo="No pudimos cargar los boletos" descripcion={errorCarga} onReintentar={fetchBoletos} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Viaje</TableHead>
                      <TableHead>Pasajero</TableHead>
                      <TableHead>Asiento</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden text-right xl:table-cell">Precio</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boletos.length === 0 ? (
                      <FilaVacia
                        colSpan={COLUMNAS}
                        icon={ICONO_SECCION.taquillaBoletos}
                        titulo={hayFiltros ? "No hay boletos con estos filtros" : "Todavía no hay boletos"}
                        accion={
                          hayFiltros ? undefined : (
                            <Button onClick={() => abrirVenta()}>
                              <Plus aria-hidden />
                              Vender boletos
                            </Button>
                          )
                        }
                      />
                    ) : (
                      visibles.map((boleto) => {
                        const origen = formatCiudad(boleto.viaje?.ruta?.ciudad_origen);
                        const destino = formatCiudad(boleto.viaje?.ruta?.ciudad_destino);
                        const rutaString = origen && destino ? `${origen} → ${destino}` : "Ruta desconocida";
                        const salida = boleto.viaje?.fecha_hora_salida ?? null;
                        const nombrePasajero = boleto.pasajero_nombre || boleto.comprador?.nombre_completo || "Sin nombre";
                        const ui = estadoUiDe(boleto);
                        const pago = pagoDe(boleto);
                        const codigo = formatCodigoBoleto(boleto.codigo_boleto);
                        const viajeId = boleto.viaje?.id ?? null;

                        return (
                          <TableRow key={boleto.id} className={cn(viajeId && "relative")}>
                            {viajeId ? (
                              <CeldaEnlace
                                onAbrir={() => abrirViaje(viajeId)}
                                etiqueta={`Ver el viaje del boleto ${codigo}`}
                                className="font-mono text-sm"
                              >
                                {codigo}
                              </CeldaEnlace>
                            ) : (
                              <TableCell className="font-mono text-sm text-foreground">{codigo}</TableCell>
                            )}
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{rutaString}</span>
                                {salida && (
                                  <span className="text-xs text-muted-foreground tabular-nums">{formatFechaHoraCortaVE(salida)}</span>
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
                              <Badge variant="outline" className="font-mono tabular-nums">
                                {boleto.asiento}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <StatusBadge status={ui} dominio="boleto" />
                                {ui === "RESERVA_SIN_PAGAR" && boleto.reserva_expira_at && (
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    Vence {formatHoraVE(boleto.reserva_expira_at)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-right xl:table-cell">
                              <Monto usd={boleto.precio} align="right" size="sm" />
                            </TableCell>
                            <TableCell className="text-right">
                              {ui === "PAGO_EN_VERIFICACION" && pago && (
                                <Button size="sm" variant="outline" className="relative z-10" onClick={() => setPagoAVerificar(pago.id)}>
                                  Verificar pago
                                </Button>
                              )}
                              {(ui === "RESERVA_SIN_PAGAR" || ui === "PAGO_RECHAZADO") && (
                                <Button size="sm" variant="outline" className="relative z-10" onClick={() => setReservaACobrar(boleto.id)}>
                                  Cobrar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
              </>
            )}
          </Card>
        )}
        {!loading && boletos.length >= LIMITE && (
          <p className="text-sm text-muted-foreground">
            Últimos {LIMITE} boletos{filtroFecha ? ` del ${formatDiaVE(filtroFecha)}` : ""}. Filtra por fecha para ver otros.
          </p>
        )}
      </div>

      <VentaFlow
        isOpen={showVentaFlow}
        viajeIdInicial={ventaViajeInicial}
        onClose={() => {
          setShowVentaFlow(false);
          setVentaViajeInicial(null);
          void fetchBoletos();
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

      <ViajeSheet
        viajeId={viajeAbierto || null}
        onOpenChange={(abierto) => !abierto && abrirViaje(null)}
        onCambio={() => void fetchBoletos()}
      />
    </div>
  );
}
