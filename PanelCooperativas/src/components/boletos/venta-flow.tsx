"use client";

import { currencyFormatterVES, dateFormatterDayMonthTime12h } from "@/lib/utils";

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-user";
import { MapPin, Clock, Users, ArrowRight, Check, Printer } from "@phosphor-icons/react";
import { SeatSelector } from "./seat-selector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { venderBoleto } from "../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load QR code renderer (~40KB) — only needed in confirmation step
const QRCodeSVG = lazy(() => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })));

type VentaStep = "viaje" | "asiento" | "pasajero" | "pago" | "confirmacion";

export interface ViajeParaVenta {
  id: string;
  fecha_hora_salida: string;
  fecha_hora_llegada_est: string;
  asientos_totales: number;
  asientos_disponibles: number;
  estado: string;
  numero_unidad: string;
  ruta: {
    ciudad_origen: string;
    estado_origen: string;
    ciudad_destino: string;
    estado_destino: string;
    precio_pasaje: number;
  };
}

interface VentaFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VentaFlow({ isOpen, onClose }: VentaFlowProps) {
  const { user } = useUser();
  const cooperativaId = user?.cooperativa_id;
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<VentaStep>("viaje");
  const [selectedViaje, setSelectedViaje] = useState<ViajeParaVenta | null>(null);
  const [selectedAsiento, setSelectedAsiento] = useState<string | null>(null);
  
  const [viajes, setViajes] = useState<ViajeParaVenta[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(true);
  const [filtroRuta, setFiltroRuta] = useState<string>("todas");

  const [pasajeroData, setPasajeroData] = useState({ nombre: "", cedula: "", telefono: "" });
  const [tipoPago, setTipoPago] = useState<"EFECTIVO" | "DIGITAL">("EFECTIVO");
  const [referenciaData, setReferenciaData] = useState({ numero: "", fecha: "", banco: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resultadoBoleto, setResultadoBoleto] = useState<any>(null);

  const fetchViajes = useCallback(async () => {
    if (!cooperativaId) return;
    setLoadingViajes(true);
    try {
      const { data, error } = await supabase
        .from("viajes")
        .select(`
          id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
          asientos_disponibles, estado, numero_unidad,
          ruta:rutas(ciudad_origen, estado_origen, ciudad_destino, estado_destino, precio_pasaje)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "PROGRAMADO")
        .gt("fecha_hora_salida", new Date().toISOString())
        .order("fecha_hora_salida", { ascending: true });

      if (error) throw error;
      setViajes((data as unknown) as ViajeParaVenta[]);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar los viajes disponibles.");
    } finally {
      setLoadingViajes(false);
    }
  }, [supabase, cooperativaId]);

  useEffect(() => {
    if (isOpen && step === "viaje") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchViajes();
    }
  }, [isOpen, step, fetchViajes]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      // Reset state on close
      setTimeout(() => {
        setStep("viaje");
        setSelectedViaje(null);
        setSelectedAsiento(null);
        setPasajeroData({ nombre: "", cedula: "", telefono: "" });
        setTipoPago("EFECTIVO");
        setReferenciaData({ numero: "", fecha: "", banco: "" });
        setResultadoBoleto(null);
      }, 300);
    }
  };

  const handleSelectViaje = (viaje: ViajeParaVenta) => {
    setSelectedViaje(viaje);
    setStep("asiento");
  };

  const handleSelectAsiento = (asiento: string) => {
    setSelectedAsiento(asiento);
    setStep("pasajero");
  };

  const handleSubmitVenta = async () => {
    if (!selectedViaje || !selectedAsiento) return;
    setIsSubmitting(true);
    
    try {
      const result = await venderBoleto({
        viajeId: selectedViaje.id,
        asiento: selectedAsiento,
        pasajeroNombre: pasajeroData.nombre,
        pasajeroCedula: pasajeroData.cedula,
        pasajeroTelefono: pasajeroData.telefono,
        tipoPago,
        referenciaData: tipoPago === "DIGITAL" ? referenciaData : undefined
      });
      
      if (result.success) {
        setResultadoBoleto(result.boleto);
        setStep("confirmacion");
        toast.success("Boleto vendido exitosamente");
      } else {
        toast.error(result.error || "Error al vender el boleto");
      }
    } catch (err) {
      toast.error("Error inesperado en la venta");
      console.error(err);
    } finally {
      setIsSubmitting(false);
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

  // Extraer rutas únicas para el filtro
  const rutasUnicas = useMemo(() => {
    const map = new Map<string, string>();
    viajes.forEach(v => {
      const key = `${v.ruta.ciudad_origen} → ${v.ruta.ciudad_destino}`;
      map.set(key, key);
    });
    return Array.from(map.values());
  }, [viajes]);

  const viajesFiltrados = useMemo(() => {
    if (filtroRuta === "todas") return viajes;
    return viajes.filter(v => `${v.ruta.ciudad_origen} → ${v.ruta.ciudad_destino}` === filtroRuta);
  }, [viajes, filtroRuta]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vender Boleto</DialogTitle>
          <DialogDescription>
            {step === "viaje" && "Paso 1: Selecciona el viaje para el pasajero."}
            {step === "asiento" && "Paso 2: Selección de asiento."}
            {step === "pasajero" && "Paso 3: Datos del pasajero."}
            {step === "pago" && "Paso 4: Pago."}
            {step === "confirmacion" && "Paso 5: Confirmación."}
          </DialogDescription>
        </DialogHeader>

        {step === "viaje" && (
          <div className="space-y-4">
            <div className="w-full sm:w-[300px]">
              <Select value={filtroRuta} onValueChange={setFiltroRuta}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por ruta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las rutas</SelectItem>
                  {rutasUnicas.map(ruta => (
                    <SelectItem key={ruta} value={ruta}>{ruta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {loadingViajes ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <Spinner size="lg" />
                  <p>Cargando viajes disponibles...</p>
                </div>
              ) : viajesFiltrados.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground border rounded-lg bg-muted/20">
                  <p>No se encontraron viajes programados.</p>
                </div>
              ) : (
                viajesFiltrados.map((viaje) => {
                  const sinAsientos = viaje.asientos_disponibles <= 0;
                  const pocosAsientos = viaje.asientos_disponibles <= 5 && !sinAsientos;
                  
                  return (
                    <Card 
                      key={viaje.id} 
                      className={`cursor-pointer transition-colors ${sinAsientos ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/50 hover:bg-muted/30'}`}
                      onClick={() => !sinAsientos && handleSelectViaje(viaje)}
                    >
                      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 font-semibold text-lg">
                            <span>{viaje.ruta.ciudad_origen}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            <span>{viaje.ruta.ciudad_destino}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              {formatDate(viaje.fecha_hora_salida)}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-4 h-4" />
                              Unidad {viaje.numero_unidad}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                          <div className="text-xl font-bold text-primary">
                            {formatMoney(viaje.ruta.precio_pasaje)}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-sm">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span className={pocosAsientos ? "text-amber-500 font-medium" : sinAsientos ? "text-red-500 font-medium" : ""}>
                                {viaje.asientos_disponibles}/{viaje.asientos_totales}
                              </span>
                            </div>
                            {sinAsientos && (
                              <Badge variant="destructive">Agotado</Badge>
                            )}
                            {pocosAsientos && (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-transparent">Pocos asientos</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}

        {step === "asiento" && selectedViaje && (
          <SeatSelector 
            viajeId={selectedViaje.id}
            totalAsientos={selectedViaje.asientos_totales}
            onSelect={handleSelectAsiento}
            onCancel={() => setStep("viaje")}
          />
        )}

        {step === "pasajero" && (
          <div className="space-y-4">
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre Completo</Label>
                <Input 
                  id="nombre" 
                  placeholder="Ej. Juan Pérez" 
                  value={pasajeroData.nombre}
                  onChange={(e) => setPasajeroData({...pasajeroData, nombre: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cedula">Cédula / RIF</Label>
                <Input 
                  id="cedula" 
                  placeholder="Ej. V-12345678" 
                  value={pasajeroData.cedula}
                  onChange={(e) => setPasajeroData({...pasajeroData, cedula: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono (Opcional)</Label>
                <Input 
                  id="telefono" 
                  type="tel"
                  placeholder="Ej. 0414-1234567" 
                  value={pasajeroData.telefono}
                  onChange={(e) => setPasajeroData({...pasajeroData, telefono: e.target.value})}
                />
              </div>
            </div>
            <div className="flex justify-between border-t pt-4">
              <Button variant="ghost" onClick={() => setStep("asiento")}>Volver</Button>
              <Button 
                onClick={() => setStep("pago")}
                disabled={pasajeroData.nombre.length < 3 || !pasajeroData.cedula}
              >
                Continuar a Pago
              </Button>
            </div>
          </div>
        )}

        {step === "pago" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base">Método de Cobro</Label>
              <ToggleGroup 
                type="single" 
                value={tipoPago} 
                onValueChange={(val) => val && setTipoPago(val as "EFECTIVO" | "DIGITAL")}
                className="justify-start gap-4"
              >
                <ToggleGroupItem value="EFECTIVO" className="h-24 w-32 flex flex-col gap-2 px-2 data-[state=on]:border-primary border-2 border-transparent bg-muted">
                  <span className="text-2xl">💵</span>
                  <span>Efectivo</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="DIGITAL" className="h-24 w-32 flex flex-col gap-2 px-2 data-[state=on]:border-primary border-2 border-transparent bg-muted">
                  <span className="text-2xl">📱</span>
                  <span>Transferencia</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            {tipoPago === "DIGITAL" && (
              <div className="grid gap-4 bg-muted/30 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label>Nº de Referencia</Label>
                  <Input 
                    value={referenciaData.numero} 
                    onChange={e => setReferenciaData({...referenciaData, numero: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input 
                      type="date"
                      value={referenciaData.fecha} 
                      onChange={e => setReferenciaData({...referenciaData, fecha: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Banco Emisor</Label>
                    <Input 
                      placeholder="Ej. Banesco"
                      value={referenciaData.banco} 
                      onChange={e => setReferenciaData({...referenciaData, banco: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between border-t pt-4">
              <Button variant="ghost" onClick={() => setStep("pasajero")} disabled={isSubmitting}>Volver</Button>
              <Button onClick={handleSubmitVenta} disabled={isSubmitting || (tipoPago === 'DIGITAL' && !referenciaData.numero)}>
                {isSubmitting && <Spinner className="mr-2" />}
                Confirmar y Vender Boleto
              </Button>
            </div>
          </div>
        )}

        {step === "confirmacion" && resultadoBoleto && (
          <div className="space-y-6 flex flex-col items-center pt-4 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8" />
            </div>
            
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold">Boleto Vendido Exitosamente</h2>
              <p className="text-muted-foreground">El asiento ha sido reservado y el pago registrado.</p>
            </div>
            
            <div className="bg-muted p-6 rounded-2xl w-full max-w-sm space-y-6">
              <div className="flex flex-col items-center">
                <span className="text-sm text-muted-foreground uppercase tracking-widest">Código de Boleto</span>
                <span className="text-3xl font-mono font-bold text-primary">{resultadoBoleto.codigo_boleto}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Pasajero</span>
                  <span className="font-medium">{resultadoBoleto.pasajero_nombre}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Cédula</span>
                  <span className="font-medium">{resultadoBoleto.pasajero_cedula}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-xs">Ruta</span>
                  <span className="font-medium">{selectedViaje?.ruta.ciudad_origen} → {selectedViaje?.ruta.ciudad_destino}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-xs">Fecha y Hora</span>
                  <span className="font-medium">{selectedViaje?.fecha_hora_salida && formatDate(selectedViaje.fecha_hora_salida)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Asiento</span>
                  <span className="font-medium text-xl">{resultadoBoleto.asiento}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Precio</span>
                  <span className="font-medium text-xl">{formatMoney(resultadoBoleto.precio)}</span>
                </div>
              </div>
              
              <div className="flex justify-center bg-white p-4 rounded-xl">
                <Suspense fallback={<Skeleton className="w-[160px] h-[160px]" />}>
                  <QRCodeSVG value={resultadoBoleto.qr_embarque_data || ""} size={160} />
                </Suspense>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button className="flex-1" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Boleto
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                setStep("viaje");
                setSelectedViaje(null);
                setSelectedAsiento(null);
                setPasajeroData({ nombre: "", cedula: "", telefono: "" });
                setResultadoBoleto(null);
              }}>
                Vender Otro
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => handleOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
