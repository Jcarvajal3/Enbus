"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ScanInput } from "@/components/scan-input";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { despacharEncomiendas } from "./actions";
import { MapPin, Clock, Truck, Package, X } from "@phosphor-icons/react";
import type { Encomienda } from "@/lib/types/encomiendas";

interface ViajeDespacho {
  id: string;
  fecha_hora_salida: string;
  numero_unidad: string;
  ruta: {
    ciudad_origen: string;
    ciudad_destino: string;
  };
}

export default function DespachoPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);

  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [viajes, setViajes] = useState<ViajeDespacho[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(false);

  const [selectedViaje, setSelectedViaje] = useState<ViajeDespacho | null>(null);
  const [encomiendasADespachar, setEncomiendasADespachar] = useState<Encomienda[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchViajes = useCallback(async () => {
    if (!cooperativaId || !fecha) return;
    setLoadingViajes(true);
    
    try {
      const startOfDay = new Date(fecha);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(fecha);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("viajes")
        .select(`
          id, fecha_hora_salida, numero_unidad,
          ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "PROGRAMADO")
        .gte("fecha_hora_salida", startOfDay.toISOString())
        .lte("fecha_hora_salida", endOfDay.toISOString())
        .order("fecha_hora_salida", { ascending: true });

      if (error) throw error;
      setViajes(data as unknown as ViajeDespacho[]);
      
      // If selected viaje is no longer in the list, unselect it
      if (selectedViaje && !data.find(v => v.id === selectedViaje.id)) {
        setSelectedViaje(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar los viajes");
    } finally {
      setLoadingViajes(false);
    }
  }, [supabase, cooperativaId, fecha, selectedViaje]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchViajes();
  }, [fetchViajes]);

  const handleEncomiendaFound = (encomienda: Encomienda) => {
    if (encomienda.estado !== "RECIBIDO") {
      toast.error(`La encomienda está en estado: ${encomienda.estado}. Solo se pueden despachar encomiendas "RECIBIDO".`);
      return;
    }

    if (encomiendasADespachar.some(e => e.id === encomienda.id)) {
      toast.warning("Esta encomienda ya está en la lista de despacho");
      return;
    }

    setEncomiendasADespachar(prev => [...prev, encomienda]);
    toast.success("Encomienda agregada a la lista de despacho");
  };

  const removerEncomienda = (id: string) => {
    setEncomiendasADespachar(prev => prev.filter(e => e.id !== id));
  };

  const handleConfirmarDespacho = async () => {
    if (!selectedViaje || encomiendasADespachar.length === 0) return;
    setIsSubmitting(true);
    try {
      const ids = encomiendasADespachar.map(e => e.id);
      const res = await despacharEncomiendas(selectedViaje.id, ids);
      if (res.success) {
        toast.success(`${ids.length} encomiendas despachadas exitosamente`);
        setEncomiendasADespachar([]);
        setSelectedViaje(null);
      } else {
        toast.error(res.error || "Error al despachar");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("es-VE", { 
      hour: "numeric", minute: "numeric", hour12: true 
    }).format(new Date(dateString));
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader 
        title="Despacho de Encomiendas" 
        description="Asignar paquetes a un viaje para iniciar su tránsito"
      >
        <Button variant="outline" onClick={() => window.history.back()}>Volver</Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna Izquierda: Viajes */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            1. Seleccionar Viaje
          </h2>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Fecha del Viaje</label>
                <Input 
                  type="date" 
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {loadingViajes ? (
                  <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Spinner size="md" />
                    <p>Cargando viajes...</p>
                  </div>
                ) : viajes.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground border rounded-lg bg-muted/20">
                    No hay viajes programados para esta fecha.
                  </div>
                ) : (
                  viajes.map((viaje) => {
                    const isSelected = selectedViaje?.id === viaje.id;
                    return (
                      <div 
                        key={viaje.id}
                        onClick={() => setSelectedViaje(viaje)}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-lg">{viaje.ruta.ciudad_origen} → {viaje.ruta.ciudad_destino}</span>
                          {isSelected && <Badge>Seleccionado</Badge>}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(viaje.fecha_hora_salida)}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            Unidad {viaje.numero_unidad}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna Derecha: Encomiendas */}
        <div className="space-y-4">
          <h2 className={`text-xl font-semibold flex items-center gap-2 ${!selectedViaje ? "text-muted-foreground" : ""}`}>
            <Package className="w-5 h-5 text-primary" />
            2. Escanear Paquetes
          </h2>
          
          {!selectedViaje ? (
            <div className="h-48 border-2 border-dashed rounded-xl flex items-center justify-center text-muted-foreground bg-muted/10 p-6 text-center">
              Selecciona primero un viaje de la lista para comenzar a escanear encomiendas a despachar.
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              <div className="bg-primary/10 text-primary px-4 py-3 rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-medium">Despachando a: {selectedViaje.ruta.ciudad_destino}</div>
                  <div className="text-sm opacity-80">Unidad {selectedViaje.numero_unidad} - {formatDate(selectedViaje.fecha_hora_salida)}</div>
                </div>
              </div>

              <ScanInput 
                onEncomiendaFound={handleEncomiendaFound}
                cooperativaId={cooperativaId}
                mode="encomiendas"
                disabled={isSubmitting}
              />

              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                    <h3 className="font-medium">Lista de Despacho</h3>
                    <Badge variant="secondary">{encomiendasADespachar.length} paquetes</Badge>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-4 space-y-2">
                    {encomiendasADespachar.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        Escanea una encomienda para agregarla a este viaje
                      </div>
                    ) : (
                      encomiendasADespachar.map((enc) => (
                        <div key={enc.id} className="flex justify-between items-center p-3 border rounded-lg bg-card">
                          <div>
                            <div className="font-mono font-medium text-sm text-primary">{enc.tracking_id}</div>
                            <div className="text-sm text-muted-foreground">{enc.descripcion}</div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removerEncomienda(enc.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full h-12 text-lg" 
                onClick={handleConfirmarDespacho}
                disabled={encomiendasADespachar.length === 0 || isSubmitting}
              >
                {isSubmitting && <Spinner className="mr-2 h-5 w-5" />}
                Confirmar Despacho ({encomiendasADespachar.length})
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
