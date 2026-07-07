"use client";

import { currencyFormatterVES, dateFormatterDayMonthTime12h } from "@/lib/utils";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Ticket, Users } from "@phosphor-icons/react";
import type { Boleto } from "@/lib/types/boletos";
import { VentaFlow } from "@/components/boletos/venta-flow";
import { ScanInput } from "@/components/scan-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { confirmarEmbarque, verificarPagoBoleto } from "./actions";
import { PasajerosViajeSheet } from "@/components/boletos/pasajeros-viaje-sheet";
import { requireOnline } from "@/components/connectivity-banner";
import { Pagination } from "@/components/ui/pagination";

type PagoRow = {
  id: string;
  monto: number;
  tipo_pago: string;
  verificado: boolean;
  banco_emisor?: string | null;
  numero_referencia?: string | null;
  fecha_transaccion: string;
};

type BoletoRow = Boleto & {
  comprador?: { nombre_completo: string } | null;
  pagos?: PagoRow[];
};

export default function TaquillaBoletosPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);
  
  const [boletos, setBoletos] = useState<BoletoRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroFecha, setFiltroFecha] = useState<string>("");

  const [showVentaFlow, setShowVentaFlow] = useState(false);
  const [boletoConfirmacion, setBoletoConfirmacion] = useState<BoletoRow | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const [pagoVerification, setPagoVerification] = useState<{ boleto: BoletoRow, pago?: PagoRow } | null>(null);
  const [isVerifyingPago, setIsVerifyingPago] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [pasajerosSheetViaje, setPasajerosSheetViaje] = useState<{ id: string, ruta: string, fecha: string } | null>(null);

  const fetchBoletos = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      let query = supabase
        .from("boletos")
        .select(`
          id, codigo_boleto, asiento, precio, estado, created_at,
          pasajero_nombre, pasajero_cedula,
          comprador:profiles!comprador_id(nombre_completo),
          viaje:viajes!viaje_id(
            id,
            fecha_hora_salida,
            ruta:rutas!ruta_id(ciudad_origen, estado_origen, ciudad_destino, estado_destino)
          ),
          pagos:pagos!boleto_id(id, monto, tipo_pago, banco_emisor, numero_referencia, fecha_transaccion, verificado)
        `)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(50);
        
      if (filtroEstado !== "todos") {
        query = query.eq("estado", filtroEstado);
      }
      
      if (filtroFecha) {
        // Create range for the entire day
        const startDate = new Date(filtroFecha);
        const endDate = new Date(filtroFecha);
        endDate.setDate(endDate.getDate() + 1);
        
        query = query
          .gte("created_at", startDate.toISOString())
          .lt("created_at", endDate.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setBoletos(data as unknown as BoletoRow[]);
    } catch (err) {
      toast.error("Error al cargar los boletos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId, filtroEstado, filtroFecha]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchBoletos();
  }, [fetchBoletos]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBoletoFound = (boleto: any) => {
    if (boleto.estado === "PAGADO") {
      setBoletoConfirmacion(boleto);
    } else if (boleto.estado === "USADO") {
      toast.warning("Este boleto ya fue usado");
    } else {
      toast.error("Boleto inválido");
    }
  };

  const handleConfirmarEmbarque = async () => {
    if (!boletoConfirmacion) return;
    setIsConfirming(true);
    try {
      const res = await requireOnline(() => confirmarEmbarque(boletoConfirmacion.id))();
      if (res.success) {
        toast.success("Embarque confirmado exitosamente");
        setBoletoConfirmacion(null);
        fetchBoletos();
      } else {
        toast.error(res.error || "Error al confirmar embarque");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al procesar el embarque";
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmarPago = async () => {
    if (!pagoVerification) return;
    setIsVerifyingPago(true);
    try {
      const res = await requireOnline(() => verificarPagoBoleto(pagoVerification.boleto.id, pagoVerification.pago?.id))();
      if (res.success) {
        toast.success("Pago verificado exitosamente. Boleto activo.");
        setPagoVerification(null);
        fetchBoletos();
      } else {
        toast.error(res.error || "Error al verificar pago");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al procesar la verificación";
      toast.error(message);
    } finally {
      setIsVerifyingPago(false);
    }
  };

  const formatMoney = (amount: number) => {
    return currencyFormatterVES.format(amount);
  };

  const formatDate = (dateString: string) => {
    try {
      return dateFormatterDayMonthTime12h.format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  const totalPages = Math.ceil(boletos.length / itemsPerPage);
  const paginatedBoletos = boletos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader 
        title="Taquilla de Boletos" 
        description="Venta y control de boletos"
      >
        <Button onClick={() => setShowVentaFlow(true)}>
          <Ticket className="w-4 h-4 mr-2" />
          Vender Boleto
        </Button>
      </PageHeader>
      
      <ScanInput 
        onBoletoFound={handleBoletoFound}
        cooperativaId={cooperativaId}
        mode="boletos"
        disabled={showVentaFlow || !!boletoConfirmacion}
      />
      
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="space-y-1.5 w-full sm:w-[200px]">
          <label className="text-sm font-medium text-muted-foreground">Filtrar por Estado</label>
          <Select value={filtroEstado} onValueChange={(val) => setFiltroEstado(val ?? "todos")}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="PAGADO">PAGADO</SelectItem>
              <SelectItem value="USADO">USADO</SelectItem>
              <SelectItem value="CANCELADO">CANCELADO</SelectItem>
              <SelectItem value="RESERVADO">RESERVADO</SelectItem>
              <SelectItem value="EXPIRADO">EXPIRADO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-[200px]">
          <label className="text-sm font-medium text-muted-foreground">Filtrar por Fecha</label>
          <Input 
            type="date" 
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
        </div>
        
        {(filtroEstado !== "todos" || filtroFecha) && (
          <Button 
            variant="ghost" 
            onClick={() => {
              setFiltroEstado("todos");
              setFiltroFecha("");
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>
      
      <div className="flex-1 space-y-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Viaje</TableHead>
                <TableHead>Pasajero</TableHead>
                <TableHead>Asiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex items-center justify-center">
                      <Spinner size="md" />
                      <span className="ml-3 text-muted-foreground font-medium">Cargando boletos...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : boletos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No se encontraron boletos con estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBoletos.map((boleto) => {
                  const origen = boleto.viaje?.ruta?.ciudad_origen || "";
                  const destino = boleto.viaje?.ruta?.ciudad_destino || "";
                  const rutaString = origen && destino ? `${origen} → ${destino}` : "Ruta desconocida";
                  const fechaSalida = boleto.viaje?.fecha_hora_salida ? formatDate(boleto.viaje.fecha_hora_salida) : "";
                  
                  const nombrePasajero = boleto.comprador?.nombre_completo || boleto.pasajero_nombre || "Desconocido";

                  // Supabase can return arrays or objects depending on the exact foreign key setup
                  const pagoAsociado = Array.isArray(boleto.pagos) ? boleto.pagos[0] : boleto.pagos;
                  // Only show the button if RESERVADO, regardless of whether we found the pago (since it might be on another ticket in the same batch)
                  const showValidarPago = boleto.estado === "RESERVADO" && (!pagoAsociado || !pagoAsociado.verificado);

                  return (
                    <TableRow key={boleto.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono font-medium text-primary">
                        {boleto.codigo_boleto}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{rutaString}</span>
                          <span className="text-xs text-muted-foreground mb-1">{fechaSalida}</span>
                          {boleto.viaje?.id && (
                            <button 
                              className="text-xs text-primary hover:underline text-left inline-flex items-center"
                              onClick={() => setPasajerosSheetViaje({ id: boleto.viaje!.id, ruta: rutaString, fecha: fechaSalida })}
                            >
                              <Users className="w-3 h-3 mr-1" />
                              Ver pasajeros
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{nombrePasajero}</span>
                          {boleto.pasajero_cedula && (
                            <span className="text-xs text-muted-foreground">{boleto.pasajero_cedula}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium bg-muted px-2 py-1 rounded-md text-xs">
                          {boleto.asiento}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 items-start">
                          <StatusBadge status={boleto.estado} />
                          {showValidarPago && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs border-primary/50 text-primary hover:bg-primary/10" 
                              onClick={() => setPagoVerification({ boleto, pago: pagoAsociado })}
                            >
                              Validar Pago
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(boleto.precio)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
        />
      </div>

      <VentaFlow 
        isOpen={showVentaFlow} 
        onClose={() => {
          setShowVentaFlow(false);
          fetchBoletos(); // Refresh table when flow closes
        }} 
      />

      <Dialog open={!!boletoConfirmacion} onOpenChange={(open) => !open && setBoletoConfirmacion(null)}>
        <DialogContent className="border-green-500/20 bg-green-50/50 dark:bg-green-950/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-500">
              <span className="text-xl">✅</span> Boleto Válido
            </DialogTitle>
          </DialogHeader>
          
          {boletoConfirmacion && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Asiento</span>
                  <span className="font-medium text-lg">{boletoConfirmacion.asiento}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Pasajero</span>
                  <span className="font-medium">{boletoConfirmacion.comprador?.nombre_completo || boletoConfirmacion.pasajero_nombre || "Desconocido"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-xs">Ruta</span>
                  <span className="font-medium">
                    {boletoConfirmacion.viaje?.ruta?.ciudad_origen} → {boletoConfirmacion.viaje?.ruta?.ciudad_destino}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-xs">Código</span>
                  <span className="font-mono font-medium">{boletoConfirmacion.codigo_boleto}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBoletoConfirmacion(null)} disabled={isConfirming}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarEmbarque} disabled={isConfirming} className="bg-green-600 hover:bg-green-700 text-white border-transparent">
              {isConfirming && <Spinner className="mr-2 h-4 w-4" />}
              Confirmar Embarque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasajerosViajeSheet
        isOpen={!!pasajerosSheetViaje}
        onClose={() => setPasajerosSheetViaje(null)}
        viajeId={pasajerosSheetViaje?.id || null}
        rutaString={pasajerosSheetViaje?.ruta || ""}
        fechaSalida={pasajerosSheetViaje?.fecha || ""}
      />

      {/* DIÁLOGO DE VERIFICACIÓN DE PAGO */}
      <Dialog open={!!pagoVerification} onOpenChange={(open) => !open && setPagoVerification(null)}>
        <DialogContent className="border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Validar Pago de Boleto
            </DialogTitle>
          </DialogHeader>
          
          {pagoVerification && (
            <div className="space-y-4 py-4">
              {pagoVerification.pago ? (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground text-sm font-bold">Monto Declarado</span>
                    <span className="font-heading text-xl text-primary">{formatMoney(pagoVerification.pago.monto)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <span className="block text-xs text-muted-foreground mb-1 uppercase font-bold">Método</span>
                      <span className="font-medium">{pagoVerification.pago.tipo_pago}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground mb-1 uppercase font-bold">Banco</span>
                      <span className="font-medium">{pagoVerification.pago.banco_emisor || "N/A"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-muted-foreground mb-1 uppercase font-bold">Referencia</span>
                      <span className="font-mono text-lg bg-secondary/50 px-2 py-1 rounded inline-block">
                        {pagoVerification.pago.numero_referencia || "N/A"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-muted-foreground mb-1 uppercase font-bold">Fecha / Hora</span>
                      <span className="font-medium text-sm">
                        {pagoVerification.pago.fecha_transaccion ? formatDate(pagoVerification.pago.fecha_transaccion) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-warning/50 bg-warning/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-warning-foreground">
                    Los datos bancarios están asociados a otro boleto de la misma compra. 
                    Si apruebas este pago manualmente, todos los boletos reservados del pasajero se marcarán como pagados de todas formas.
                  </p>
                </div>
              )}

              <div className="bg-success/10 p-3 rounded-lg border border-success/20">
                <p className="text-sm text-success-foreground font-medium">
                  Al aprobar este pago, el boleto cambiará a estado PAGADO y se generará el código QR de abordaje para el pasajero.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPagoVerification(null)} disabled={isVerifyingPago}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarPago} disabled={isVerifyingPago}>
              {isVerifyingPago && <Spinner className="mr-2 h-4 w-4" />}
              Aprobar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
