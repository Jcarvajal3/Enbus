"use client";

// ─── Hoja del viaje (PN-09, PN-17, PN-23) ────────────────────────────────────
// Una sola forma de ver un viaje, desde Viajes y desde la Taquilla de boletos:
// título = identidad ("Caracas → Valencia · 2:30 p. m.") + estado; datos del
// bus; acciones (Marcar salida / Marcar llegada, Ir a Despacho, Imprimir
// manifiesto y, solo en Viajes, Editar y Cancelar); pasajeros con el embarque
// y encomiendas, cada una enlazada a su detalle.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DotsThree, PencilSimple, Printer, XCircle } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { StatusBadge } from "@/components/status-badge";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { useUser } from "@/hooks/use-user";
import { avisarError } from "@/lib/avisos";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { formatFechaHoraCortaVE, formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { imprimirManifiesto, MSG_VENTANA_BLOQUEADA } from "@/lib/printing/manifiesto";
import { createClient } from "@/lib/supabase/client";
import { formatCedula } from "@/lib/ve";
import { getEstadoUiBoleto, type EstadoVerificacion } from "@/lib/types/pagos";
import type { EstadoBoleto } from "@/lib/types/boletos";
import { MarcarLlegadaDialog, MarcarSalidaDialog, identidadViaje, type ViajeParaSalida } from "./marcar-viaje-dialogs";

export type ViajeDetalle = {
  id: string;
  estado: string;
  fecha_hora_salida: string;
  fecha_hora_llegada_est: string | null;
  asientos_totales: number;
  asientos_disponibles: number;
  numero_unidad: string | null;
  nombre_chofer: string | null;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
};

type BoletoViaje = {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: EstadoBoleto;
  embarcado_at: string | null;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  comprador: { nombre_completo: string; cedula_rif: string | null } | null;
  pago: { estado_verificacion: EstadoVerificacion } | { estado_verificacion: EstadoVerificacion }[] | null;
};

type EncomiendaViaje = {
  id: string;
  tracking_id: string;
  estado: string;
  receiver_nombre: string | null;
  receiver_telefono: string | null;
  peso_kg: number | null;
  modalidad_pago: string | null;
  costo_calculado: number | null;
};

const SELECT_VIAJE =
  "id, estado, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales, asientos_disponibles, numero_unidad, nombre_chofer, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)";
const SELECT_BOLETOS =
  "id, codigo_boleto, asiento, estado, embarcado_at, pasajero_nombre, pasajero_cedula, comprador:profiles!comprador_id(nombre_completo, cedula_rif), pago:pagos!boletos_pago_id_fkey(estado_verificacion)";
const SELECT_ENCOMIENDAS =
  "id, tracking_id, estado, receiver_nombre, receiver_telefono, peso_kg, modalidad_pago, costo_calculado";

/** Boletos que ocupan asiento (los demás solo cuentan para el manifiesto). */
const ESTADOS_PASAJERO: EstadoBoleto[] = ["RESERVADO", "PAGADO", "USADO"];

function estadoUi(b: BoletoViaje) {
  const pago = Array.isArray(b.pago) ? b.pago[0] : b.pago;
  return getEstadoUiBoleto(b.estado, pago?.estado_verificacion ?? null);
}

function pesoTexto(kg: number | null) {
  return kg ? `${String(kg).replace(".", ",")} kg` : "—";
}

export function paraSalida(v: ViajeDetalle): ViajeParaSalida {
  return {
    id: v.id,
    origen: v.ruta?.ciudad_origen ?? "",
    destino: v.ruta?.ciudad_destino ?? "",
    salida: v.fecha_hora_salida,
  };
}

export function ViajeSheet({
  viajeId,
  onOpenChange,
  onCambio,
  onEditar,
  onCancelar,
  cancelando = false,
  recarga = 0,
}: {
  viajeId: string | null;
  onOpenChange(o: boolean): void;
  /** Tras marcar la salida o la llegada (la lista que abrió la hoja se recarga). */
  onCambio?(): void;
  /** Solo en Viajes, para el administrador. */
  onEditar?(viaje: ViajeDetalle): void;
  onCancelar?(viaje: ViajeDetalle): void;
  /** Mientras se calcula el impacto de cancelar. */
  cancelando?: boolean;
  /** Cambia para volver a cargar el viaje (p. ej. tras editarlo). */
  recarga?: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const tasa = useTasaBCV();

  // Se conserva el último viaje mientras la hoja se cierra (sin parpadeo).
  const [mostrado, setMostrado] = useState<string | null>(viajeId);
  if (viajeId && viajeId !== mostrado) setMostrado(viajeId);

  const [viaje, setViaje] = useState<ViajeDetalle | null>(null);
  const [boletos, setBoletos] = useState<BoletoViaje[]>([]);
  const [encomiendas, setEncomiendas] = useState<EncomiendaViaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [llegadaOpen, setLlegadaOpen] = useState(false);

  const cargar = useCallback(
    async (id: string, vigente: () => boolean = () => true) => {
      setCargando(true);
      setError(null);
      try {
        const [v, b, e] = await Promise.all([
          supabase.from("viajes").select(SELECT_VIAJE).eq("id", id).maybeSingle(),
          supabase.from("boletos").select(SELECT_BOLETOS).eq("viaje_id", id),
          supabase.from("encomiendas").select(SELECT_ENCOMIENDAS).eq("viaje_id", id),
        ]);
        if (!vigente()) return;
        const fallo = v.error ?? b.error ?? e.error;
        if (fallo) throw fallo;
        if (!v.data) {
          setViaje(null);
          setError("No encontramos este viaje en tu cooperativa.");
          return;
        }
        const filas = ((b.data ?? []) as unknown as BoletoViaje[]).sort(
          (x, y) => (Number(x.asiento) || 0) - (Number(y.asiento) || 0) || x.asiento.localeCompare(y.asiento)
        );
        setViaje(v.data as unknown as ViajeDetalle);
        setBoletos(filas);
        setEncomiendas((e.data ?? []) as unknown as EncomiendaViaje[]);
      } catch (err) {
        if (vigente()) setError(humanizeError(err, "cargar el viaje"));
      } finally {
        if (vigente()) setCargando(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!viajeId) return;
    let vigente = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir
    void cargar(viajeId, () => vigente);
    return () => {
      vigente = false;
    };
  }, [viajeId, recarga, cargar]);

  const recargar = () => {
    if (mostrado) void cargar(mostrado);
    onCambio?.();
  };

  const pasajeros = boletos.filter((b) => ESTADOS_PASAJERO.includes(b.estado));
  const confirmados = pasajeros.filter((b) => b.estado === "PAGADO" || b.estado === "USADO");
  const embarcados = confirmados.filter((b) => b.estado === "USADO").length;
  const porVerificar = pasajeros.filter((b) => estadoUi(b) === "PAGO_EN_VERIFICACION").length;
  const sinPagar = pasajeros.filter((b) => ["RESERVA_SIN_PAGAR", "PAGO_RECHAZADO"].includes(estadoUi(b))).length;

  const imprimir = () => {
    if (!viaje) return;
    const ok = imprimirManifiesto({
      cooperativa: user.cooperativa_nombre,
      ciudadOrigen: viaje.ruta?.ciudad_origen,
      ciudadDestino: viaje.ruta?.ciudad_destino,
      salida: viaje.fecha_hora_salida,
      numeroUnidad: viaje.numero_unidad,
      nombreChofer: viaje.nombre_chofer,
      pasajeros: boletos,
      encomiendas,
      tasa: tasa?.tasa ?? null,
    });
    if (!ok) avisarError(MSG_VENTANA_BLOQUEADA);
  };

  const listo = viaje && viaje.id === mostrado && !cargando;
  const titulo = viaje
    ? identidadViaje({ origen: viaje.ruta?.ciudad_origen, destino: viaje.ruta?.ciudad_destino, salida: viaje.fecha_hora_salida })
    : "Viaje";
  const programado = viaje?.estado === "PROGRAMADO";
  const enCurso = viaje?.estado === "EN_CURSO";
  const conMenu = Boolean(viaje && programado && (onEditar || onCancelar));

  return (
    <Sheet open={viajeId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle>{titulo}</SheetTitle>
            {viaje && <StatusBadge status={viaje.estado} dominio="viaje" />}
          </div>
          <SheetDescription>{viaje ? formatFechaVE(viaje.fecha_hora_salida) : "Cargando el viaje"}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-6">
          {error && !cargando ? (
            <ErrorState
              compacto
              titulo="No pudimos cargar el viaje"
              descripcion={error}
              onReintentar={() => (mostrado ? cargar(mostrado) : undefined)}
            />
          ) : !listo || !viaje ? (
            <div className="flex flex-col gap-6" role="status" aria-label="Cargando el viaje">
              <div className="grid grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-32 rounded-full" />
                <Skeleton className="h-9 w-40 rounded-full" />
              </div>
              <Skeleton className="h-48 w-full rounded-md" />
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Salida</dt>
                  <dd className="font-medium tabular-nums">{formatFechaHoraCortaVE(viaje.fecha_hora_salida)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Llegada estimada</dt>
                  <dd className="font-medium tabular-nums">
                    {viaje.fecha_hora_llegada_est ? formatFechaHoraCortaVE(viaje.fecha_hora_llegada_est) : "—"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Asientos</dt>
                  <dd className="font-medium tabular-nums">
                    {viaje.asientos_disponibles} libres de {viaje.asientos_totales}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Unidad</dt>
                  <dd className="font-medium">{viaje.numero_unidad || "Sin asignar"}</dd>
                </div>
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Chofer</dt>
                  <dd className="font-medium">{viaje.nombre_chofer || "Sin asignar"}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                {programado && <Button onClick={() => setSalidaOpen(true)}>Marcar salida</Button>}
                {enCurso && <Button onClick={() => setLlegadaOpen(true)}>Marcar llegada</Button>}
                {programado && (
                  <Link href={`/cooperativas/despacho?viaje=${viaje.id}`} className={buttonVariants({ variant: "outline" })}>
                    <ICONO_SECCION.despacho aria-hidden />
                    Ir a Despacho
                  </Link>
                )}
                <Button variant="outline" onClick={imprimir}>
                  <Printer aria-hidden />
                  Imprimir manifiesto
                </Button>
                {conMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={cancelando}
                      render={<Button variant="ghost" size="icon" aria-label="Más acciones del viaje" />}
                    >
                      {cancelando ? <Spinner size="sm" /> : <DotsThree aria-hidden />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEditar && (
                        <DropdownMenuItem onClick={() => onEditar(viaje)}>
                          <PencilSimple aria-hidden />
                          Editar viaje
                        </DropdownMenuItem>
                      )}
                      {onCancelar && (
                        <DropdownMenuItem variant="destructive" onClick={() => onCancelar(viaje)}>
                          <XCircle aria-hidden />
                          Cancelar viaje
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <section aria-labelledby="viaje-pasajeros" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 id="viaje-pasajeros" className="text-sm font-semibold">
                    Pasajeros ({pasajeros.length})
                  </h3>
                  {confirmados.length > 0 && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {embarcados} de {confirmados.length} embarcados
                    </p>
                  )}
                </div>
                {(porVerificar > 0 || sinPagar > 0) && (
                  <p className="text-sm text-muted-foreground">
                    {[porVerificar > 0 && `${porVerificar} con pago por verificar`, sinPagar > 0 && `${sinPagar} sin pagar`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {pasajeros.length === 0 ? (
                  <Card className="py-0">
                    <EmptyState compacto icon={ICONO_SECCION.taquillaBoletos} title="Sin pasajeros todavía" />
                  </Card>
                ) : (
                  <Card className="gap-0 overflow-hidden p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Asiento</TableHead>
                          <TableHead>Pasajero</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pasajeros.map((b) => {
                          const nombre = b.pasajero_nombre || b.comprador?.nombre_completo || "Sin nombre";
                          const cedula = b.pasajero_cedula || b.comprador?.cedula_rif;
                          return (
                            <TableRow key={b.id}>
                              <TableCell>
                                <Badge variant="outline" className="font-mono tabular-nums">
                                  {b.asiento}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-52">
                                <span className="block truncate font-medium">{nombre}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {cedula ? `${formatCedula(cedula)} · ` : ""}
                                  <span className="font-mono">{formatCodigoBoleto(b.codigo_boleto)}</span>
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-start gap-1">
                                  <StatusBadge status={estadoUi(b)} dominio="boleto" />
                                  {b.estado === "USADO" && b.embarcado_at && (
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                      {formatHoraVE(b.embarcado_at)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </section>

              <section aria-labelledby="viaje-encomiendas" className="flex flex-col gap-3">
                <h3 id="viaje-encomiendas" className="text-sm font-semibold">
                  Encomiendas ({encomiendas.length})
                </h3>
                <Card className="gap-0 overflow-hidden p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Destinatario</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {encomiendas.length === 0 ? (
                        <FilaVacia colSpan={4} icon={ICONO_SECCION.taquillaEncomiendas} titulo="Sin encomiendas en este viaje" />
                      ) : (
                        encomiendas.map((e) => (
                          <TableRow key={e.id} className="relative">
                            <CeldaEnlace
                              href={`/cooperativas/taquilla/encomiendas?encomienda=${e.id}`}
                              etiqueta={`Ver encomienda ${e.tracking_id}`}
                              className="font-mono text-sm"
                            >
                              {e.tracking_id}
                            </CeldaEnlace>
                            <TableCell className="max-w-40 truncate">{e.receiver_nombre || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{pesoTexto(e.peso_kg)}</TableCell>
                            <TableCell>
                              <StatusBadge status={e.estado} dominio="encomienda" />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </section>
            </>
          )}
        </div>

        <MarcarSalidaDialog
          viaje={viaje ? paraSalida(viaje) : null}
          open={salidaOpen}
          onOpenChange={setSalidaOpen}
          onHecho={recargar}
        />
        <MarcarLlegadaDialog
          viaje={viaje ? paraSalida(viaje) : null}
          open={llegadaOpen}
          onOpenChange={setLlegadaOpen}
          onHecho={recargar}
        />
      </SheetContent>
    </Sheet>
  );
}

/** Ciudad legible de la ruta de un viaje (para etiquetas de fila). */
export function rutaViaje(v: { ruta?: { ciudad_origen?: string | null; ciudad_destino?: string | null } | null }) {
  return `${formatCiudad(v.ruta?.ciudad_origen)} → ${formatCiudad(v.ruta?.ciudad_destino)}`;
}
