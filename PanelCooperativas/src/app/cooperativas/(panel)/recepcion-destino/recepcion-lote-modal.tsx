"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Truck, Package, ArrowLeft } from "@phosphor-icons/react";
import { recibirLote } from "./actions";
import { requireOnline } from "@/components/connectivity-banner";

interface RecepcionLoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  cooperativaId: string;
  onSuccess: () => void;
}

type ViajeData = {
  id: string;
  fecha_hora_salida: string;
  numero_unidad: string | null;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
  encomiendas: {
    id: string;
    tracking_id: string;
    estado: string;
    receiver_nombre: string;
  }[];
};

export function RecepcionLoteModal({ isOpen, onClose, cooperativaId, onSuccess }: RecepcionLoteModalProps) {
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [viajes, setViajes] = useState<ViajeData[]>([]);
  const [selectedViaje, setSelectedViaje] = useState<ViajeData | null>(null);
  const [selectedEncomiendaIds, setSelectedEncomiendaIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchViajes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("viajes")
          .select(`
            id, fecha_hora_salida, numero_unidad,
            ruta:rutas(ciudad_origen, ciudad_destino),
            encomiendas:encomiendas!viaje_id(id, tracking_id, estado, receiver_nombre)
          `)
          .eq("cooperativa_id", cooperativaId)
          .eq("estado", "EN_CURSO")
          .order("fecha_hora_salida", { ascending: false });

        if (!isMounted) return;
        if (error) throw error;

        // Filtrar solo los viajes que tienen al menos una encomienda EN_TRANSITO
        const viajesValidos = (data as unknown as ViajeData[]).filter(v => 
          v.encomiendas?.some(e => e.estado === "EN_TRANSITO")
        );

        setViajes(viajesValidos);
      } catch (err) {
        if (!isMounted) return;
        console.error(err);
        toast.error("Error al cargar los viajes en curso");
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
  }, [isOpen, supabase, cooperativaId]);

  const encomiendasPendientes = selectedViaje?.encomiendas.filter(e => e.estado === "EN_TRANSITO") || [];

  const handleViajeSelect = (viaje: ViajeData) => {
    setSelectedViaje(viaje);
    // Seleccionar todas por defecto
    const encomiendasTransito = viaje.encomiendas.filter(e => e.estado === "EN_TRANSITO");
    setSelectedEncomiendaIds(new Set(encomiendasTransito.map(e => e.id)));
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
      
      if (result.success) {
        toast.success(`✅ ${result.count} encomiendas recibidas exitosamente`);
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Error al procesar el lote");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "numeric",
    }).format(new Date(dateString));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedViaje && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -ml-2 rounded-full" 
                onClick={() => setSelectedViaje(null)}
              >
                <ArrowLeft size={18} />
              </Button>
            )}
            <Truck size={24} className="text-primary" weight="duotone" />
            {selectedViaje ? "Confirmar Lote" : "Seleccionar Viaje en Curso"}
          </DialogTitle>
          <DialogDescription>
            {selectedViaje 
              ? "Selecciona las encomiendas que llegaron en este viaje para marcarlas como recibidas."
              : "Selecciona el viaje del cual quieres recibir todas las encomiendas pendientes."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[300px] mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[300px]">
              <Spinner size="md" />
              <span className="text-muted-foreground mt-4">Buscando viajes en curso...</span>
            </div>
          ) : !selectedViaje ? (
            /* PASO 1: SELECCIONAR VIAJE */
            viajes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                <Truck size={48} className="text-muted/50 mb-4" />
                <h3 className="font-medium text-lg">No hay viajes con encomiendas</h3>
                <p className="text-muted-foreground mt-2">
                  Actualmente no hay viajes en curso con encomiendas dirigidas hacia esta cooperativa que estén pendientes de recepción.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {viajes.map((viaje) => {
                    const pendientes = viaje.encomiendas.filter(e => e.estado === "EN_TRANSITO").length;
                    return (
                      <Card 
                        key={viaje.id} 
                        className="p-4 cursor-pointer hover:border-primary/50 transition-colors flex justify-between items-center group"
                        onClick={() => handleViajeSelect(viaje)}
                      >
                        <div>
                          <div className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">
                            {viaje.ruta?.ciudad_origen} → {viaje.ruta?.ciudad_destino}
                          </div>
                          <div className="text-sm text-muted-foreground flex gap-3">
                            <span>{formatDate(viaje.fecha_hora_salida)}</span>
                            {viaje.numero_unidad && (
                              <>
                                <span>•</span>
                                <span>Unidad {viaje.numero_unidad}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-2xl font-bold text-primary">{pendientes}</span>
                          <span className="text-xs text-muted-foreground uppercase font-medium">Pendientes</span>
                        </div>
                      </Card>
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
                    checked={selectedEncomiendaIds.size === encomiendasPendientes.length && encomiendasPendientes.length > 0}
                    onCheckedChange={(c) => handleToggleAll(c === true)}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Seleccionar Todas ({encomiendasPendientes.length})
                  </label>
                </div>
                <div className="text-sm text-muted-foreground">
                  Viaje de {selectedViaje.ruta?.ciudad_origen}
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
                  {isSubmitting ? <Spinner className="h-4 w-4 text-white" /> : <Package weight="bold" size={18} />}
                  Recibir {selectedEncomiendaIds.size} Encomiendas
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
