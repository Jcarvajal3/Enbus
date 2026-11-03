"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CaretRight } from "@phosphor-icons/react";
import { recibirLote } from "./actions";
import { requireOnline } from "@/components/connectivity-banner";
import { AvisoError } from "@/components/aviso-error";
import { EmptyState } from "@/components/empty-state";
import { TonoBadge } from "@/components/status-badge";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { ErrorState } from "@/components/error-state";
import { formatFechaHoraCortaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { vaASucursal, type SucursalRecepcion } from "./sucursal";
import { formatCiudad } from "@/lib/ciudades";

interface RecepcionLoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  cooperativaId: string;
  /** Sucursal donde recibe el usuario; null = toda la cooperativa. */
  sucursal: SucursalRecepcion | null;
  onSuccess: () => void;
}

type EncomiendaLote = {
  id: string;
  tracking_id: string;
  estado: string;
  receiver_nombre: string;
  ciudad_destino: string;
  sucursal_destino_id: string | null;
  viaje: {
    id: string;
    fecha_hora_salida: string;
    numero_unidad: string | null;
    estado: string;
    ruta: { ciudad_origen: string; ciudad_destino: string } | null;
  } | null;
};

/** Encomiendas en camino agrupadas por el viaje en que se despacharon. */
type ViajeData = {
  /** id del viaje, o "sin-viaje" para las despachadas sin viaje (datos viejos). */
  id: string;
  fecha_hora_salida: string | null;
  numero_unidad: string | null;
  /** Estado del viaje: puede seguir PROGRAMADO si nadie marcó la salida. */
  estado: string | null;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
  encomiendas: Omit<EncomiendaLote, "viaje">[];
};

const SIN_VIAJE = "sin-viaje";

/** Agrupa por viaje, del más reciente al más antiguo (las sin viaje al final). */
function agruparPorViaje(lista: EncomiendaLote[]): ViajeData[] {
  const grupos = new Map<string, ViajeData>();
  for (const { viaje, ...encomienda } of lista) {
    const clave = viaje?.id ?? SIN_VIAJE;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        id: clave,
        fecha_hora_salida: viaje?.fecha_hora_salida ?? null,
        numero_unidad: viaje?.numero_unidad ?? null,
        estado: viaje?.estado ?? null,
        ruta: viaje?.ruta ?? null,
        encomiendas: [],
      };
      grupos.set(clave, grupo);
    }
    grupo.encomiendas.push(encomienda);
  }
  return Array.from(grupos.values()).sort((a, b) => {
    if (!a.fecha_hora_salida) return 1;
    if (!b.fecha_hora_salida) return -1;
    return b.fecha_hora_salida.localeCompare(a.fecha_hora_salida);
  });
}

export function RecepcionLoteModal({ isOpen, onClose, cooperativaId, sucursal, onSuccess }: RecepcionLoteModalProps) {
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [viajes, setViajes] = useState<ViajeData[]>([]);
  const [selectedViaje, setSelectedViaje] = useState<ViajeData | null>(null);
  const [selectedEncomiendaIds, setSelectedEncomiendaIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Todas las encomiendas en camino de la cooperativa, sea cual sea el estado del
    // viaje (el despacho ya no cambia el viaje a EN_CURSO; la salida se marca aparte).
    const fetchViajes = async () => {
      setLoading(true);
      setErrorCarga(null);
      try {
        const { data, error } = await supabase
          .from("encomiendas")
          .select(`
            id, tracking_id, estado, receiver_nombre, ciudad_destino, sucursal_destino_id,
            viaje:viajes!viaje_id(id, fecha_hora_salida, numero_unidad, estado, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino))
          `)
          .eq("cooperativa_id", cooperativaId)
          .eq("estado", "EN_TRANSITO")
          .order("created_at", { ascending: true });

        if (!isMounted) return;
        if (error) throw error;

        // Solo las que vienen a la sucursal del usuario
        const enCamino = ((data as unknown as EncomiendaLote[]) ?? []).filter(
          (e) => !sucursal || vaASucursal(e, sucursal)
        );
        setViajes(agruparPorViaje(enCamino));
      } catch (err) {
        if (!isMounted) return;
        setErrorCarga(humanizeError(err, "cargar las encomiendas en camino"));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (isOpen) {
      void fetchViajes();
    } else {
      // Reset state when closed
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedViaje(null);
      setSelectedEncomiendaIds(new Set());
      setErrorEnvio(null);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, supabase, cooperativaId, sucursal, recarga]);

  // Paso 2 con su control principal enfocado ("Llegaron todas"); Espacio lo marca.
  const todasRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selectedViaje) return;
    const t = window.setTimeout(() => todasRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [selectedViaje]);

  const encomiendasPendientes = selectedViaje?.encomiendas.filter(e => e.estado === "EN_TRANSITO") || [];

  const handleViajeSelect = (viaje: ViajeData) => {
    setErrorEnvio(null);
    setSelectedViaje(viaje);
    // Nada marcado de antemano (PC-36): se marca lo que de verdad llegó.
    setSelectedEncomiendaIds(new Set());
  };

  const handleToggleEncomienda = (id: string, checked: boolean) => {
    const newSet = new Set(selectedEncomiendaIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedEncomiendaIds(newSet);
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedEncomiendaIds(new Set(encomiendasPendientes.map(e => e.id)));
    } else {
      setSelectedEncomiendaIds(new Set());
    }
  };

  const handleConfirmar = async () => {
    if (selectedEncomiendaIds.size === 0) return;

    setIsSubmitting(true);
    setErrorEnvio(null);
    try {
      const ids = Array.from(selectedEncomiendaIds);
      const result = await requireOnline(() => recibirLote(ids))();

      if (result.success && result.count === 0) {
        // Ninguna seguía en camino (otro usuario ya las recibió)
        avisarInfo("Ya las habían recibido: no se recibió ninguna.");
        onSuccess();
        onClose();
      } else if (result.success) {
        const n = result.count === 1 ? "1 encomienda recibida" : `${result.count} encomiendas recibidas`;
        if (result.count < ids.length) avisarInfo(`${n} de ${ids.length}. Las demás ya estaban recibidas.`);
        else avisarExito(`${n}.`);
        onSuccess();
        onClose();
      } else {
        setErrorEnvio(result.error || humanizeError(null, "recibir el lote"));
      }
    } catch (err) {
      setErrorEnvio(humanizeError(err, "recibir el lote"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const rutaDe = (v: ViajeData) =>
    v.ruta ? `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}` : "Sin viaje asignado";
  const marcadas = selectedEncomiendaIds.size;

  return (
    // Esc o clic fuera cierran, salvo mientras se recibe el lote.
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent tamano="flujo" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{selectedViaje ? "Marca las que llegaron" : "Recibir lote del viaje"}</DialogTitle>
          <DialogDescription>
            {selectedViaje
              ? `${rutaDe(selectedViaje)}${selectedViaje.fecha_hora_salida ? ` · ${formatFechaHoraCortaVE(selectedViaje.fecha_hora_salida)}` : ""}. Las que no marques siguen «En tránsito».`
              : "Paso 1 de 2 · Elige el viaje"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Buscando encomiendas en camino">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : errorCarga ? (
          <ErrorState
            compacto
            titulo="No pudimos cargar las encomiendas en camino"
            descripcion={errorCarga}
            onReintentar={() => setRecarga((n) => n + 1)}
          />
        ) : !selectedViaje ? (
          /* PASO 1: ELEGIR VIAJE */
          viajes.length === 0 ? (
            <EmptyState compacto icon={ICONO_SECCION.recepcion} title="No hay encomiendas en camino" />
          ) : (
            <ul className="flex flex-col gap-2">
              {viajes.map((viaje, i) => {
                const pendientes = viaje.encomiendas.filter((e) => e.estado === "EN_TRANSITO").length;
                return (
                  <li key={viaje.id}>
                    <button
                      type="button"
                      // El primer viaje queda enfocado: Enter lo elige.
                      autoFocus={i === 0}
                      aria-label={`${rutaDe(viaje)}: ${pendientes} en camino`}
                      className="flex w-full items-center justify-between gap-4 rounded-md border border-border bg-card p-4 text-left transition-colors outline-none hover:border-input-border hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onClick={() => handleViajeSelect(viaje)}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-base font-semibold">{rutaDe(viaje)}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
                          {viaje.fecha_hora_salida && <span>{formatFechaHoraCortaVE(viaje.fecha_hora_salida)}</span>}
                          {viaje.numero_unidad && <span>· Unidad {viaje.numero_unidad}</span>}
                          {viaje.estado === "PROGRAMADO" && <TonoBadge tono="pendiente">Sin salida marcada</TonoBadge>}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                        <span className="tabular-nums">
                          <span className="font-semibold text-foreground">{pendientes}</span> en camino
                        </span>
                        <CaretRight className="size-4" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          /* PASO 2: MARCAR LAS QUE LLEGARON */
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md bg-muted/50 px-4 py-3">
              <Checkbox
                id="select-all"
                ref={todasRef}
                checked={marcadas === encomiendasPendientes.length && encomiendasPendientes.length > 0}
                onCheckedChange={(c) => handleToggleAll(c === true)}
              />
              <label htmlFor="select-all" className="cursor-pointer text-sm font-medium">
                Llegaron todas ({encomiendasPendientes.length})
              </label>
            </div>

            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {encomiendasPendientes.map((encomienda) => (
                <li key={encomienda.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    id={encomienda.id}
                    checked={selectedEncomiendaIds.has(encomienda.id)}
                    onCheckedChange={(c) => handleToggleEncomienda(encomienda.id, c === true)}
                  />
                  <label htmlFor={encomienda.id} className="flex flex-1 cursor-pointer items-center justify-between gap-3">
                    <span className="font-mono text-sm text-foreground">{encomienda.tracking_id}</span>
                    <span className="max-w-48 truncate text-sm text-muted-foreground">{encomienda.receiver_nombre}</span>
                  </label>
                </li>
              ))}
            </ul>

            {errorEnvio && <AvisoError>{errorEnvio}</AvisoError>}
          </div>
        )}

        {selectedViaje && !loading && !errorCarga && (
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setSelectedViaje(null)} disabled={isSubmitting}>
              Atrás
            </Button>
            <Button onClick={handleConfirmar} disabled={marcadas === 0 || isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting && <Spinner size="sm" />}
              {marcadas === 0 ? "Recibir" : `Recibir ${marcadas} de ${encomiendasPendientes.length}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
