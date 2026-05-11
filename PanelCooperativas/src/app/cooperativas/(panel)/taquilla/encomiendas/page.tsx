"use client";

import { relativeTimeFormatter, dateFormatterDayMonthTime } from "@/lib/utils";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ScanInput } from "@/components/scan-input";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Truck } from "@phosphor-icons/react";
import Link from "next/link";
import type { Encomienda } from "@/lib/types/encomiendas";
import { Spinner } from "@/components/ui/spinner";
import { RecepcionModal } from "@/components/encomiendas/recepcion-modal";
import { PagoModal } from "@/components/encomiendas/pago-modal";
import { PhotoCaptureModal } from "@/components/encomiendas/photo-capture-modal";
import { DetalleSheet } from "@/components/encomiendas/detalle-sheet";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";

export default function TaquillaEncomiendasPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id;
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);
  
  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>("todas");
  
  // State for modals (Integrates with Tarea 8)
  const [modalState, setModalState] = useState<
    | { type: "closed" }
    | { type: "recepcion"; encomienda: Encomienda }
    | { type: "pago"; encomienda: Encomienda }
    | { type: "photo"; encomiendaId: string }
    | { type: "detail"; encomienda: Encomienda }
  >({ type: "closed" });

  const fetchEncomiendas = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, estado, modalidad_pago, peso_kg, costo_calculado,
          created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
          receiver_nombre, receiver_telefono,
          sender:profiles!sender_id(nombre_completo)
        `)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(50);
        
      if (filtroEstado !== "todas") {
        query = query.eq("estado", filtroEstado);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setEncomiendas(data as unknown as Encomienda[]);
    } catch (err) {
      toast.error("Error al cargar las encomiendas");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId, filtroEstado]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchEncomiendas();
  }, [fetchEncomiendas]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Usar ref para el callback del realtime: evita que el canal WebSocket se
  // destruya y re-cree en cada cambio de filtro (filtroEstado).
  const fetchEncomiendasRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchEncomiendasRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);

  useEncomiendasRealtime(cooperativaId, () => fetchEncomiendasRef.current());

  const handleRowClick = (encomienda: Encomienda) => {
    if (encomienda.estado === "PENDIENTE_DE_ESCANEO") {
      setModalState({ type: "recepcion", encomienda });
    } else if (encomienda.estado === "POR_PAGAR") {
      setModalState({ type: "pago", encomienda });
    } else {
      setModalState({ type: "detail", encomienda });
    }
  };

  const formatDateRelative = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInDays = Math.round(diffInMs / (1000 * 3600 * 24));
      
      if (diffInDays < 1) {
        const diffInHours = Math.round(diffInMs / (1000 * 3600));
        if (diffInHours < 1) {
          const diffInMinutes = Math.round(diffInMs / (1000 * 60));
          return relativeTimeFormatter.format(-diffInMinutes, 'minute');
        }
        return relativeTimeFormatter.format(-diffInHours, 'hour');
      }
      
      if (diffInDays < 7) {
        return relativeTimeFormatter.format(-diffInDays, 'day');
      }
      
      return dateFormatterDayMonthTime.format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader 
        title="Taquilla de Encomiendas" 
      >
        <Button asChild>
          <Link href="/cooperativas/taquilla/encomiendas/despacho">
            <Truck className="w-4 h-4 mr-2" />
            Despachar a Viaje
          </Link>
        </Button>
      </PageHeader>
      
      <ScanInput 
        onEncomiendaFound={handleRowClick} 
        cooperativaId={cooperativaId} 
        disabled={modalState.type !== "closed"} 
      />
      
      <div className="flex-1 space-y-4">
        <Tabs value={filtroEstado} onValueChange={setFiltroEstado} className="w-full">
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="PENDIENTE_DE_ESCANEO">Pendientes</TabsTrigger>
            <TabsTrigger value="EN_RECEPCION">En Recepción</TabsTrigger>
            <TabsTrigger value="POR_PAGAR">Por Pagar</TabsTrigger>
            <TabsTrigger value="PAGADA">Pagadas</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking ID</TableHead>
                <TableHead>Remitente</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex items-center justify-center">
                      <Spinner size="md" />
                      <span className="ml-3 text-muted-foreground font-medium">Cargando encomiendas...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : encomiendas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No se encontraron encomiendas en esta categoría.
                  </TableCell>
                </TableRow>
              ) : (
                encomiendas.map((encomienda) => (
                  <TableRow 
                    key={encomienda.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(encomienda)}
                  >
                    <TableCell className="font-mono font-medium text-primary">
                      {encomienda.tracking_id}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {encomienda.sender?.nombre_completo || "Desconocido"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {encomienda.receiver_nombre}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="truncate max-w-[100px]" title={encomienda.ciudad_origen}>
                          {encomienda.ciudad_origen}
                        </span>
                        <span>→</span>
                        <span className="font-medium text-foreground truncate max-w-[100px]" title={encomienda.ciudad_destino}>
                          {encomienda.ciudad_destino}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={encomienda.estado} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm whitespace-nowrap capitalize">
                      {formatDateRelative(encomienda.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {modalState.type === "recepcion" && (
        <RecepcionModal
          encomienda={modalState.encomienda}
          cooperativaId={cooperativaId}
          isOpen={true}
          onClose={() => setModalState({ type: "closed" })}
          onSuccess={() => {
            fetchEncomiendas(); // Refresh the table
            if (modalState.encomienda.modalidad_pago === "ORIGEN") {
              setModalState({ 
                type: "pago", 
                encomienda: { ...modalState.encomienda, estado: "POR_PAGAR" } 
              });
            } else {
              setModalState({ type: "closed" });
            }
          }}
        />
      )}

      {modalState.type === "pago" && (
        <PagoModal
          encomienda={modalState.encomienda}
          cooperativaId={cooperativaId}
          isOpen={true}
          onClose={() => setModalState({ type: "closed" })}
          onSuccess={(encomiendaId) => {
            fetchEncomiendas(); // Refresh the table
            setModalState({ type: "photo", encomiendaId });
          }}
        />
      )}

      {modalState.type === "photo" && (
        <PhotoCaptureModal
          encomiendaId={modalState.encomiendaId}
          isOpen={true}
          onSuccess={() => {
            fetchEncomiendas(); // Refresh the table
            setModalState({ type: "closed" });
          }}
        />
      )}

      {modalState.type === "detail" && (
        <DetalleSheet
          encomienda={modalState.encomienda}
          isOpen={true}
          onClose={() => setModalState({ type: "closed" })}
        />
      )}
    </div>
  );
}
