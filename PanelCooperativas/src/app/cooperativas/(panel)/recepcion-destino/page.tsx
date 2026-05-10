"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ScanInput } from "@/components/scan-input";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Package, Truck } from "@phosphor-icons/react";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import { recibirEncomienda } from "./actions";
import { RecepcionLoteModal } from "./recepcion-lote-modal";

type ViajeData = {
  id: string;
  fecha_hora_salida: string;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
};

type EncomiendaTransito = {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  estado_origen: string;
  ciudad_origen: string;
  estado: string;
  sender: { nombre_completo: string } | null;
  viaje: ViajeData | null;
};

export default function RecepcionDestinoPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);
  
  const [encomiendas, setEncomiendas] = useState<EncomiendaTransito[]>([]);
  const [loading, setLoading] = useState(true);

  const [isLoteModalOpen, setIsLoteModalOpen] = useState(false);

  const fetchEncomiendas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, receiver_nombre, receiver_telefono,
          estado_origen, ciudad_origen, estado,
          sender:profiles!sender_id(nombre_completo),
          viaje:viajes!viaje_id(
            id, fecha_hora_salida,
            ruta:rutas(ciudad_origen, ciudad_destino)
          )
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "EN_TRANSITO")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEncomiendas(data as unknown as EncomiendaTransito[]);
    } catch (err) {
      toast.error("Error al cargar las encomiendas en tránsito");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId]);

  useEffect(() => {
    fetchEncomiendas();
  }, [fetchEncomiendas]);

  useEncomiendasRealtime(cooperativaId, fetchEncomiendas);

  const handleScanFound = async (encomienda: any) => {
    // 2.1.b Validar estado
    if (encomienda.estado !== "EN_TRANSITO") {
      toast.error(`Solo se pueden recibir encomiendas en tránsito. Estado actual: ${encomienda.estado.replace(/_/g, " ")}`);
      return;
    }

    // 2.1.c Procesar recepción
    const result = await recibirEncomienda(encomienda.id);
    if (result.success) {
      toast.success(`✅ ${encomienda.tracking_id} — ${encomienda.receiver_nombre} — Recibida`);
      fetchEncomiendas();
    } else {
      toast.error(result.error || "Error al recibir la encomienda");
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Intl.DateTimeFormat("es-VE", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "numeric",
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader 
        title="Recepción en Destino" 
        description="Escanea o selecciona las encomiendas para marcarlas como recibidas en esta sucursal."
      >
        <Button onClick={() => setIsLoteModalOpen(true)} className="flex items-center gap-2">
          <Truck size={18} weight="bold" />
          <span>Recibir Lote del Viaje</span>
        </Button>
      </PageHeader>
      
      <ScanInput 
        onEncomiendaFound={handleScanFound} 
        cooperativaId={cooperativaId} 
        mode="encomiendas"
        disabled={isLoteModalOpen}
      />
      
      <div className="flex-1 rounded-md border bg-card">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Spinner size="md" />
            <span className="ml-3 mt-4 text-muted-foreground font-medium">Cargando encomiendas...</span>
          </div>
        ) : encomiendas.length === 0 ? (
          <EmptyState 
            icon={Package}
            title="No hay encomiendas en tránsito"
            description="No hay encomiendas en estado 'EN_TRANSITO' dirigidas a esta cooperativa/sucursal actualmente."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking ID</TableHead>
                <TableHead>Remitente</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Viaje Asignado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {encomiendas.map((encomienda) => (
                <TableRow key={encomienda.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono font-medium text-primary">
                    {encomienda.tracking_id}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {encomienda.sender?.nombre_completo || "Desconocido"}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {encomienda.receiver_nombre}
                  </TableCell>
                  <TableCell className="truncate max-w-[120px]">
                    {encomienda.ciudad_origen}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {encomienda.viaje ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {encomienda.viaje.ruta?.ciudad_origen} → {encomienda.viaje.ruta?.ciudad_destino}
                        </span>
                        <span>{formatDate(encomienda.viaje.fecha_hora_salida)}</span>
                      </div>
                    ) : (
                      <span className="italic">Sin viaje asignado</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <RecepcionLoteModal 
        isOpen={isLoteModalOpen} 
        onClose={() => setIsLoteModalOpen(false)} 
        cooperativaId={cooperativaId}
        onSuccess={fetchEncomiendas}
      />
    </div>
  );
}
