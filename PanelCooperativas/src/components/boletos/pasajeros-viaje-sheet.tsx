"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Clock } from "@phosphor-icons/react";

interface PasajerosSheetProps {
  viajeId: string | null;
  rutaString: string;
  fechaSalida: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PasajeroRow {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: string;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  comprador: {
    nombre_completo: string;
    cedula_rif: string;
  } | null;
}

export function PasajerosViajeSheet({
  viajeId,
  rutaString,
  fechaSalida,
  isOpen,
  onClose,
}: PasajerosSheetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [pasajeros, setPasajeros] = useState<PasajeroRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPasajeros = useCallback(async () => {
    if (!viajeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("boletos")
        .select(`
          id, codigo_boleto, asiento, estado, pasajero_nombre, pasajero_cedula,
          comprador:profiles!comprador_id(nombre_completo, cedula_rif)
        `)
        .eq("viaje_id", viajeId)
        .in("estado", ["PAGADO", "USADO"])
        .order("asiento", { ascending: true });

      if (error) throw error;
      setPasajeros(data as unknown as PasajeroRow[]);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar la lista de pasajeros");
    } finally {
      setLoading(false);
    }
  }, [supabase, viajeId]);

  useEffect(() => {
    if (isOpen && viajeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchPasajeros();
    }
  }, [isOpen, viajeId, fetchPasajeros]);

  const embarcados = pasajeros.filter((p) => p.estado === "USADO").length;
  const total = pasajeros.length;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Lista de Pasajeros</SheetTitle>
          <SheetDescription>
            Viaje: <strong className="text-foreground">{rutaString}</strong>
            <br />
            Salida: {fechaSalida}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Spinner size="lg" />
            <p>Cargando pasajeros...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border">
              <span className="font-medium text-sm">Progreso de Embarque</span>
              <Badge variant={embarcados === total && total > 0 ? "default" : "secondary"} className="text-sm">
                {embarcados} / {total} embarcados
              </Badge>
            </div>

            {pasajeros.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                No hay pasajeros registrados o pagados en este viaje.
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Asiento</TableHead>
                      <TableHead>Pasajero</TableHead>
                      <TableHead>Cédula</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pasajeros.map((p) => {
                      const nombre =
                        p.comprador?.nombre_completo ||
                        p.pasajero_nombre ||
                        "Desconocido";
                      const cedula =
                        p.comprador?.cedula_rif || p.pasajero_cedula || "-";
                      const isEmbarcado = p.estado === "USADO";

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <Badge variant="outline" className="font-mono">{p.asiento}</Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[150px]">{nombre}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{cedula}</TableCell>
                          <TableCell className="text-right">
                            {isEmbarcado ? (
                              <div className="inline-flex items-center text-green-600 font-medium text-sm">
                                <CheckCircle className="w-4 h-4 mr-1.5" />
                                Embarcado
                              </div>
                            ) : (
                              <div className="inline-flex items-center text-amber-600 font-medium text-sm">
                                <Clock className="w-4 h-4 mr-1.5" />
                                Pendiente
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
