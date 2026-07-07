"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Handshake, MagnifyingGlass, LockKey } from "@phosphor-icons/react";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import { EntregaModal } from "@/components/entrega/entrega-modal";

type EncomiendaEntrega = {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  modalidad_pago: "ORIGEN" | "DESTINO";
  costo_calculado: number | null;
  estado: string;
  updated_at: string;
  pin_bloqueado: boolean;
  sender: { nombre_completo: string } | null;
};

function RetentionBadge({ dias }: { dias: number }) {
  if (dias > 4) {
    return <Badge variant="destructive">{dias} {dias === 1 ? "día" : "días"} ⚠️</Badge>;
  }
  if (dias > 3) {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">{dias} días</Badge>;
  }
  return <Badge variant="outline">{dias} {dias === 1 ? "día" : "días"}</Badge>;
}

export default function EntregaPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);
  
  const [encomiendas, setEncomiendas] = useState<EncomiendaEntrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Estado para el modal de entrega
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    encomiendaId: string | null;
  }>({ isOpen: false, encomiendaId: null });

  const fetchEncomiendas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, receiver_nombre, receiver_telefono,
          receiver_cedula_rif, modalidad_pago, costo_calculado,
          estado, updated_at, pin_bloqueado,
          sender:profiles!sender_id(nombre_completo)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "EN_OFICINA_DESTINO")
        .order("updated_at", { ascending: true }); // Más antiguas primero

      if (error) throw error;
      setEncomiendas(data as unknown as EncomiendaEntrega[]);
    } catch (err) {
      toast.error("Error al cargar las encomiendas listas para entrega");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEncomiendas();
  }, [fetchEncomiendas]);

  // Patrón useRef: evita que el canal WebSocket se destruya/re-cree
  // al cambiar estado interno del componente.
  const fetchEncomiendasRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchEncomiendasRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);

  useEncomiendasRealtime(cooperativaId, () => fetchEncomiendasRef.current());

  const diasEnOficina = (updatedAt: string): number => {
    const llegada = new Date(updatedAt);
    const ahora = new Date();
    // Normalizar a medianoche para evitar diferencias por horas
    llegada.setHours(0, 0, 0, 0);
    ahora.setHours(0, 0, 0, 0);
    const diff = ahora.getTime() - llegada.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const filteredEncomiendas = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return encomiendas;
    return encomiendas.filter(
      (e) =>
        e.tracking_id.toLowerCase().includes(q) ||
        e.receiver_nombre.toLowerCase().includes(q)
    );
  }, [searchQuery, encomiendas]);

  const handleRowClick = (encomiendaId: string) => {
    setModalState({ isOpen: true, encomiendaId });
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader 
        title="Entrega de Encomiendas" 
        description="Gestiona las encomiendas que se encuentran físicamente en esta oficina listas para ser entregadas al destinatario."
      />
      
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlass size={20} className="text-muted-foreground" />
        </div>
        <Input
          type="text"
          placeholder="Buscar por Tracking ID o nombre del destinatario..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 shadow-sm"
        />
      </div>
      
      <div className="flex-1 rounded-md border bg-card overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 h-64">
            <Spinner size="md" />
            <span className="ml-3 mt-4 text-muted-foreground font-medium">Cargando inventario...</span>
          </div>
        ) : filteredEncomiendas.length === 0 ? (
          <div className="flex-1">
            <EmptyState 
              icon={Handshake}
              title={searchQuery ? "No se encontraron coincidencias" : "Oficina al día"}
              description={searchQuery ? "Intenta buscar con otros términos." : "No hay encomiendas almacenadas en la oficina pendientes de entrega."}
            />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking ID</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-center">Días en Oficina</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Seguridad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEncomiendas.map((encomienda) => (
                  <TableRow 
                    key={encomienda.id} 
                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => handleRowClick(encomienda.id)}
                  >
                    <TableCell className="font-mono font-medium text-primary group-hover:underline">
                      {encomienda.tracking_id}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {encomienda.receiver_nombre}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {encomienda.receiver_telefono}
                    </TableCell>
                    <TableCell className="text-center">
                      <RetentionBadge dias={diasEnOficina(encomienda.updated_at)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={encomienda.modalidad_pago === "ORIGEN" ? "default" : "outline"} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200">
                        {encomienda.modalidad_pago === "ORIGEN" ? "Pagado Origen" : "Cobro Destino"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {encomienda.pin_bloqueado ? (
                        <div className="flex items-center gap-1.5 text-destructive font-medium text-sm">
                          <LockKey size={16} weight="bold" />
                          Bloqueado
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                          PIN Activo
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EntregaModal
        isOpen={modalState.isOpen}
        encomiendaId={modalState.encomiendaId}
        onClose={() => setModalState({ isOpen: false, encomiendaId: null })}
        onSuccess={() => {
          fetchEncomiendas();
          setModalState({ isOpen: false, encomiendaId: null });
        }}
      />
    </div>
  );
}
