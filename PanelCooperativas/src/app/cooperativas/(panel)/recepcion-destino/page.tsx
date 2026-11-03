"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import { recibirEncomienda, obtenerSucursalRecepcion } from "./actions";
import type { Encomienda } from "@/lib/types/encomiendas";
import { RecepcionLoteModal } from "./recepcion-lote-modal";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { ErrorState } from "@/components/error-state";
import { remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { formatFechaVE } from "@/lib/fechas";
import { vaASucursal, type SucursalRecepcion } from "./sucursal";

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
  ciudad_destino: string;
  sucursal_destino_id: string | null;
  estado: string;
  origen_registro?: Encomienda["origen_registro"];
  remitente_nombre?: string | null;
  remitente_cedula?: string | null;
  remitente_telefono?: string | null;
  sender?: { nombre_completo: string };
  viaje: ViajeData | null;
};

export default function RecepcionDestinoPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<EncomiendaTransito[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Sucursal donde recibe el usuario (null = toda la cooperativa)
  const [sucursal, setSucursal] = useState<SucursalRecepcion | null>(null);
  const [alcanceCargado, setAlcanceCargado] = useState(false);

  const [isLoteModalOpen, setIsLoteModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    obtenerSucursalRecepcion()
      .then((res) => {
        if (!isMounted) return;
        if (res.error) toast.error(res.error);
        setSucursal(res.sucursal ?? null);
      })
      .catch((err) => {
        if (isMounted) toast.error(humanizeError(err, "cargar tu sucursal"));
      })
      .finally(() => {
        if (isMounted) setAlcanceCargado(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchEncomiendas = useCallback(async () => {
    if (!alcanceCargado) return;
    setLoading(true);
    setErrorCarga(null);
    try {
      const { data, error } = await supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, receiver_nombre, receiver_telefono,
          estado_origen, ciudad_origen, ciudad_destino, sucursal_destino_id, estado,
          origen_registro, remitente_nombre, remitente_cedula, remitente_telefono,
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
      const lista = (data as unknown as EncomiendaTransito[]) ?? [];
      // Solo las que vienen hacia la sucursal del usuario
      setEncomiendas(sucursal ? lista.filter((e) => vaASucursal(e, sucursal)) : lista);
    } catch (err) {
      setErrorCarga(humanizeError(err, "cargar las encomiendas en camino"));
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId, sucursal, alcanceCargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEncomiendas();
  }, [fetchEncomiendas]);

  // Callback estable para que el canal en tiempo real no se vuelva a crear en cada render.
  const fetchRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);
  const alCambiar = useCallback(() => void fetchRef.current(), []);
  useEncomiendasRealtime(cooperativaId, alCambiar);

  const handleScanFound = async (encomienda: Encomienda) => {
    // 2.1.b Validar estado
    if (encomienda.estado !== "EN_TRANSITO") {
      toast.error(
        encomienda.estado === "EN_OFICINA_DESTINO"
          ? `${encomienda.tracking_id} ya fue recibida: está lista para entregar en «Entrega».`
          : `${encomienda.tracking_id} no viene en camino (estado: ${etiquetaEstado("encomienda", encomienda.estado)}). Solo se reciben encomiendas en tránsito.`
      );
      return;
    }

    // 2.1.c Procesar recepción (el servidor rechaza las que van a otra sucursal)
    try {
      const result = await requireOnline(() => recibirEncomienda(encomienda.id))();
      if (result.success) {
        toast.success(`${encomienda.tracking_id} (${encomienda.receiver_nombre}) recibida. Ya puedes entregarla desde «Entrega».`);
        fetchEncomiendas();
      } else {
        toast.error(result.error || humanizeError(null, "recibir la encomienda"));
      }
    } catch (err) {
      toast.error(humanizeError(err, "recibir la encomienda"));
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Sin fecha";
    return formatFechaVE(dateString, { day: "2-digit", month: "short", hour: "numeric", minute: "numeric" }) || dateString;
  };

  const descripcion = sucursal
    ? `Escanea o selecciona las encomiendas que llegaron a tu sucursal ${sucursal.nombre} (${sucursal.ciudad}) para marcarlas como recibidas.`
    : user.role === "admin_cooperativa"
      ? "Escanea o selecciona las encomiendas que llegaron para marcarlas como recibidas. Ves las de todas las sucursales de tu cooperativa."
      : "Escanea o selecciona las encomiendas que llegaron para marcarlas como recibidas. Tu cuenta no tiene sucursal asignada, así que ves las de toda la cooperativa: avísale al administrador.";

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        title="Recepción en destino"
        description={descripcion}
      >
        <Button onClick={() => setIsLoteModalOpen(true)} className="flex items-center gap-2" disabled={!alcanceCargado}>
          <Truck size={18} weight="bold" />
          <span>Recibir lote del viaje</span>
        </Button>
      </PageHeader>

      <ScanInput
        onEncomiendaFound={handleScanFound}
        cooperativaId={cooperativaId}
        mode="encomiendas"
        disabled={isLoteModalOpen}
      />

      <div className="flex-1 rounded-md border bg-card">
        {loading && encomiendas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Spinner size="md" />
            <span className="ml-3 mt-4 text-muted-foreground font-medium">Cargando encomiendas…</span>
          </div>
        ) : errorCarga ? (
          <ErrorState
            titulo="No pudimos cargar las encomiendas en camino"
            descripcion={errorCarga}
            onReintentar={fetchEncomiendas}
          />
        ) : encomiendas.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay encomiendas en camino"
            description={sucursal
              ? `No hay encomiendas en camino hacia tu sucursal ${sucursal.nombre} en este momento.`
              : "No hay encomiendas en camino hacia tu cooperativa en este momento."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Remitente</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Viaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {encomiendas.map((encomienda) => (
                <TableRow key={encomienda.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono font-medium text-primary-text">
                    {encomienda.tracking_id}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {remitenteDe(encomienda).nombre}
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
        sucursal={sucursal}
        onSuccess={fetchEncomiendas}
      />
    </div>
  );
}
