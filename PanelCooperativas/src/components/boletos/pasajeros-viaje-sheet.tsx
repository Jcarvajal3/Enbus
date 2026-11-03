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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/errores";
import { formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { getEstadoUiBoleto, type EstadoUiBoleto, type EstadoVerificacion } from "@/lib/types/pagos";
import type { EstadoBoleto } from "@/lib/types/boletos";
import { ArrowClockwise, CheckCircle, Clock } from "@phosphor-icons/react";

interface PasajerosSheetProps {
  viajeId: string | null;
  rutaString: string;
  /** Salida del viaje (ISO); se muestra en hora de Venezuela. */
  salida: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PasajeroRow {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: EstadoBoleto;
  embarcado_at: string | null;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  comprador: {
    nombre_completo: string;
    cedula_rif: string;
  } | null;
  pago: { estado_verificacion: EstadoVerificacion } | { estado_verificacion: EstadoVerificacion }[] | null;
}

function estadoUi(p: PasajeroRow): EstadoUiBoleto {
  const pago = Array.isArray(p.pago) ? p.pago[0] : p.pago;
  return getEstadoUiBoleto(p.estado, pago?.estado_verificacion ?? null);
}

export function PasajerosViajeSheet({
  viajeId,
  rutaString,
  salida,
  isOpen,
  onClose,
}: PasajerosSheetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [pasajeros, setPasajeros] = useState<PasajeroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const fetchPasajeros = useCallback(async () => {
    if (!viajeId) return;
    setLoading(true);
    setErrorCarga(null);
    try {
      // Incluye las reservas de la app (sin pagar o con pago por verificar): esa
      // gente también llega al andén y hay que saber en qué estado está.
      const { data, error } = await supabase
        .from("boletos")
        .select(`
          id, codigo_boleto, asiento, estado, embarcado_at, pasajero_nombre, pasajero_cedula,
          comprador:profiles!comprador_id(nombre_completo, cedula_rif),
          pago:pagos!boletos_pago_id_fkey(estado_verificacion)
        `)
        .eq("viaje_id", viajeId)
        .in("estado", ["RESERVADO", "PAGADO", "USADO"]);

      if (error) throw error;
      const filas = (data ?? []) as unknown as PasajeroRow[];
      // Orden natural de asiento: 2 antes que 10.
      filas.sort((a, b) => (Number(a.asiento) || 0) - (Number(b.asiento) || 0) || a.asiento.localeCompare(b.asiento));
      setPasajeros(filas);
    } catch (err) {
      console.error(err);
      setErrorCarga(humanizeError(err, "cargar la lista de pasajeros"));
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

  const confirmados = pasajeros.filter((p) => p.estado === "PAGADO" || p.estado === "USADO");
  const embarcados = confirmados.filter((p) => p.estado === "USADO").length;
  const porVerificar = pasajeros.filter((p) => estadoUi(p) === "PAGO_EN_VERIFICACION").length;
  const sinPagar = pasajeros.filter((p) => {
    const e = estadoUi(p);
    return e === "RESERVA_SIN_PAGAR" || e === "PAGO_RECHAZADO";
  }).length;

  const salidaTexto = salida
    ? formatFechaVE(salida, { weekday: "short", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hour12: true })
    : "";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Lista de pasajeros</SheetTitle>
          <SheetDescription>
            Viaje: <strong className="text-foreground">{rutaString}</strong>
            {salidaTexto && (
              <>
                <br />
                Salida: {salidaTexto}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Spinner size="lg" />
            <p>Cargando pasajeros…</p>
          </div>
        ) : errorCarga ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-destructive">{errorCarga}</p>
            <Button variant="outline" onClick={() => void fetchPasajeros()}>
              <ArrowClockwise className="w-4 h-4 mr-2" />
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 p-3 rounded-lg border">
              <span className="font-medium text-sm">Embarque</span>
              <Badge variant={embarcados === confirmados.length && confirmados.length > 0 ? "default" : "secondary"} className="text-sm">
                {embarcados} de {confirmados.length} embarcados
              </Badge>
              {(porVerificar > 0 || sinPagar > 0) && (
                <p className="w-full text-xs text-muted-foreground">
                  {[
                    porVerificar > 0 && `${porVerificar} con pago por verificar`,
                    sinPagar > 0 && `${sinPagar} apartados sin pagar`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  . No cuentan como confirmados hasta que se apruebe o se cobre el pago.
                </p>
              )}
            </div>

            {pasajeros.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                Todavía no hay pasajeros en este viaje.
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
                      const nombre = p.pasajero_nombre || p.comprador?.nombre_completo || "Sin nombre";
                      const cedula = p.pasajero_cedula || p.comprador?.cedula_rif || "—";
                      const ui = estadoUi(p);

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <Badge variant="outline" className="font-mono">{p.asiento}</Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[150px]">{nombre}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{cedula}</TableCell>
                          <TableCell className="text-right">
                            {ui === "USADO" ? (
                              <div className="inline-flex flex-col items-end text-green-600 font-medium text-sm">
                                <span className="inline-flex items-center">
                                  <CheckCircle className="w-4 h-4 mr-1.5" aria-hidden />
                                  Embarcado
                                </span>
                                {p.embarcado_at && (
                                  <span className="text-xs font-normal text-muted-foreground">{formatHoraVE(p.embarcado_at)}</span>
                                )}
                              </div>
                            ) : ui === "PAGADO" ? (
                              <div className="inline-flex items-center text-amber-600 font-medium text-sm">
                                <Clock className="w-4 h-4 mr-1.5" aria-hidden />
                                Por embarcar
                              </div>
                            ) : (
                              <StatusBadge status={ui} />
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
