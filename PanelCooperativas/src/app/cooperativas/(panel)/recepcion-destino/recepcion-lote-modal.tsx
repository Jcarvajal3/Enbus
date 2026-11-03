"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Truck, Package, ArrowLeft } from "@phosphor-icons/react";
import { recibirLote } from "./actions";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { ErrorState } from "@/components/error-state";
import { formatFechaVE } from "@/lib/fechas";
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
    try {
      const ids = Array.from(selectedEncomiendaIds);
      const result = await requireOnline(() => recibirLote(ids))();
      
      if (result.success && result.count === 0) {
        // Ninguna seguía en camino (otro usuario ya las recibió)
        toast.error("No se recibió ninguna encomienda: ya habían sido recibidas. Actualiza la lista.");
        onSuccess();
        onClose();
      } else if (result.success) {
        if (result.count < ids.length) {
          toast.warning(`Se recibieron ${result.count} de ${ids.length} encomiendas. Las demás ya habían sido recibidas. Ya puedes entregarlas desde «Entrega».`);
        } else {
          toast.success(
            `${result.count === 1 ? "1 encomienda recibida. Ya puedes entregarla" : `${result.count} encomiendas recibidas. Ya puedes entregarlas`} desde «Entrega».`
          );
        }
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || humanizeError(null, "recibir el lote"));
      }
    } catch (err) {
      toast.error(humanizeError(err, "recibir el lote"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) =>
    formatFechaVE(dateString, { day: "2-digit", month: "short", hour: "numeric", minute: "numeric" });

  return (
    // Esc o clic fuera cierran, salvo mientras se recibe el lote.
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedViaje && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -ml-2 rounded-full"
                onClick={() => setSelectedViaje(null)}
                aria-label="Volver a la lista de viajes"
              >
                <ArrowLeft size={18} aria-hidden />
              </Button>
            )}
            <Truck size={24} className="text-primary-text" weight="duotone" aria-hidden />
            {selectedViaje ? "Confirmar lote" : "Elegir viaje"}
          </DialogTitle>
          <DialogDescription>
            {selectedViaje 
              ? "Marca una por una las encomiendas que llegaron en este viaje. Las que no marques siguen «En tránsito»."
              : "Elige el viaje en que llegaron las encomiendas. Aparecen todos los viajes con encomiendas en camino, aunque no se haya marcado su salida."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[300px] mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[300px]">
              <Spinner size="md" />
              <span className="text-muted-foreground mt-4">Buscando encomiendas en camino…</span>
            </div>
          ) : errorCarga ? (
            <ErrorState
              titulo="No pudimos cargar las encomiendas en camino"
              descripcion={errorCarga}
              onReintentar={() => setRecarga((n) => n + 1)}
            />
          ) : !selectedViaje ? (
            /* PASO 1: SELECCIONAR VIAJE */
            viajes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                <Truck size={48} className="text-muted-foreground mb-4" aria-hidden />
                <h3 className="font-medium text-lg">No hay encomiendas en camino</h3>
                <p className="text-muted-foreground mt-2">
                  {sucursal
                    ? `Ahora no hay encomiendas en camino hacia tu sucursal ${sucursal.nombre}.`
                    : "Ahora no hay encomiendas en camino hacia tu cooperativa."}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {viajes.map((viaje, i) => {
                    const pendientes = viaje.encomiendas.filter(e => e.estado === "EN_TRANSITO").length;
                    return (
                      <button
                        type="button"
                        key={viaje.id}
                        // El primer viaje queda enfocado: Enter lo elige.
                        autoFocus={i === 0}
                        aria-label={`${viaje.ruta ? `Viaje ${formatCiudad(viaje.ruta.ciudad_origen)} a ${formatCiudad(viaje.ruta.ciudad_destino)}` : "Sin viaje asignado"}: ${pendientes} pendientes`}
                        className="w-full rounded-xl border bg-card p-4 text-left cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors flex justify-between items-center group"
                        onClick={() => handleViajeSelect(viaje)}
                      >
                        <div>
                          <div className="font-semibold text-base mb-1 group-hover:text-primary-text transition-colors">
                            {viaje.ruta ? `${formatCiudad(viaje.ruta.ciudad_origen)} → ${formatCiudad(viaje.ruta.ciudad_destino)}` : "Sin viaje asignado"}
                          </div>
                          <div className="text-sm text-muted-foreground flex gap-3">
                            {viaje.fecha_hora_salida && <span>{formatDate(viaje.fecha_hora_salida)}</span>}
                            {viaje.numero_unidad && (
                              <>
                                <span>•</span>
                                <span>Unidad {viaje.numero_unidad}</span>
                              </>
                            )}
                          </div>
                          {viaje.estado === "PROGRAMADO" && (
                            <div className="mt-1 text-xs text-warning-text">
                              En origen no se marcó la salida de este bus.
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-2xl font-bold text-primary-text">{pendientes}</span>
                          <span className="text-xs text-muted-foreground uppercase font-medium">Pendientes</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )
          ) : (
            /* PASO 2: CONFIRMAR ENCOMIENDAS */
            <div className="space-y-4">
              <div className="bg-muted/40 p-3 rounded-md mb-4 flex items-center justify-between border">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="select-all" 
                    ref={todasRef}
                    checked={selectedEncomiendaIds.size === encomiendasPendientes.length && encomiendasPendientes.length > 0}
                    onCheckedChange={(c) => handleToggleAll(c === true)}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Llegaron todas ({encomiendasPendientes.length})
                  </label>
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedViaje.ruta ? `Viaje desde ${formatCiudad(selectedViaje.ruta.ciudad_origen)}` : "Sin viaje asignado"}
                </div>
              </div>

              <ScrollArea className="h-[320px] border rounded-md p-4">
                <div className="space-y-3">
                  {encomiendasPendientes.map((encomienda) => (
                    <div key={encomienda.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <Checkbox 
                        id={encomienda.id} 
                        checked={selectedEncomiendaIds.has(encomienda.id)}
                        onCheckedChange={(c) => handleToggleEncomienda(encomienda.id, c === true)}
                      />
                      <label htmlFor={encomienda.id} className="flex-1 flex justify-between items-center cursor-pointer">
                        <span className="font-mono font-medium">{encomienda.tracking_id}</span>
                        <span className="text-sm text-muted-foreground max-w-[150px] truncate">{encomienda.receiver_nombre}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setSelectedViaje(null)} disabled={isSubmitting}>
                  Volver
                </Button>
                <Button 
                  onClick={handleConfirmar} 
                  disabled={selectedEncomiendaIds.size === 0 || isSubmitting}
                  className="gap-2"
                >
                  {isSubmitting ? <Spinner className="h-4 w-4" /> : <Package weight="bold" size={18} aria-hidden />}
                  {selectedEncomiendaIds.size === 0
                    ? "Marca las que llegaron"
                    : `Recibir ${selectedEncomiendaIds.size === 1 ? "1 encomienda" : `${selectedEncomiendaIds.size} encomiendas`} de ${encomiendasPendientes.length}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
