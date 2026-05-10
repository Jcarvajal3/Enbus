"use client";

import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Money, LockKey, Warning, User, IdentificationCard, Phone, Package, Scales, CurrencyDollar } from "@phosphor-icons/react";
import { PinInput } from "./pin-input";
import { confirmarEntrega } from "@/app/cooperativas/(panel)/entrega/actions";
import { procesarPago } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";

interface EntregaEncomienda {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  descripcion_contenido: string | null;
  modalidad_pago: "ORIGEN" | "DESTINO";
  peso_kg: number | null;
  costo_calculado: number | null;
  updated_at: string;
  pin_bloqueado: boolean;
  intentos_pin: number;
  cooperativa_id: string;
  sender: { nombre_completo: string } | null;
}

interface EntregaModalProps {
  encomiendaId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EntregaModal({ encomiendaId, isOpen, onClose, onSuccess }: EntregaModalProps) {
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [encomienda, setEncomienda] = useState<EntregaEncomienda | null>(null);
  const [pagoPendiente, setPagoPendiente] = useState<{ id: string; banco_emisor: string | null; numero_referencia: string | null } | null>(null);
  
  // Estados para validación
  const [pagoOk, setPagoOk] = useState(false);
  const [pinOk, setPinOk] = useState(false);
  const [pinBloqueado, setPinBloqueado] = useState(false);
  const [intentos, setIntentos] = useState(0);

  const [isProcessingPago, setIsProcessingPago] = useState(false);

  useEffect(() => {
    if (isOpen && encomiendaId) {
      fetchDetails();
    } else {
      // Reset states
      setEncomienda(null);
      setPagoPendiente(null);
      setPagoOk(false);
      setPinOk(false);
      setPinBloqueado(false);
      setIntentos(0);
    }
  }, [isOpen, encomiendaId]);

  const fetchDetails = async () => {
    setLoading(true);
    let isMounted = true;

    try {
      // Obtener detalles completos de la encomienda
      const { data: enc, error: encError } = await supabase
        .from("encomiendas")
        .select(`
          *,
          sender:profiles!sender_id(nombre_completo)
        `)
        .eq("id", encomiendaId)
        .single();

      if (!isMounted) return;
      if (encError) throw encError;
      
      setEncomienda(enc as EntregaEncomienda);
      setPinBloqueado(enc.pin_bloqueado);
      setIntentos(enc.intentos_pin || 0);

      // Si la modalidad es ORIGEN, el pago ya está ok
      if (enc.modalidad_pago === "ORIGEN") {
        setPagoOk(true);
      } else {
        // Verificar si hay pago verificado
        const { data: pagoVerificado } = await supabase
          .from("pagos")
          .select("id")
          .eq("encomienda_id", encomiendaId)
          .eq("verificado", true)
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (pagoVerificado) {
          setPagoOk(true);
        } else {
          setPagoOk(false);
          // Verificar si hay pago pendiente por aprobar
          const { data: pagoNoVerificado } = await supabase
            .from("pagos")
            .select("id, banco_emisor, numero_referencia")
            .eq("encomienda_id", encomiendaId)
            .eq("verificado", false)
            .limit(1)
            .maybeSingle();

          if (!isMounted) return;
          setPagoPendiente(pagoNoVerificado || null);
        }
      }
    } catch (err) {
      if (!isMounted) return;
      console.error(err);
      toast.error("Error al cargar los detalles de la encomienda");
      onClose();
    } finally {
      if (isMounted) setLoading(false);
    }

    return () => { isMounted = false; };
  };

  const diasEnOficina = (updatedAt: string): number => {
    const llegada = new Date(updatedAt);
    const ahora = new Date();
    llegada.setHours(0, 0, 0, 0);
    ahora.setHours(0, 0, 0, 0);
    return Math.floor((ahora.getTime() - llegada.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleAprobarPago = async (tipo: "DIGITAL" | "EFECTIVO") => {
    if (!encomienda) return;
    setIsProcessingPago(true);
    try {
      const result = await procesarPago(
        encomienda.id,
        tipo,
        encomienda.costo_calculado ?? 0,
        encomienda.cooperativa_id,
        tipo === "DIGITAL" && pagoPendiente ? pagoPendiente.id : undefined
      );

      if (result.success) {
        setPagoOk(true);
        setPagoPendiente(null);
        toast.success(tipo === "EFECTIVO" ? "Cobro en efectivo registrado" : "Pago digital aprobado");
      } else {
        toast.error(result.error || "Error al registrar el pago");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar el pago");
    } finally {
      setIsProcessingPago(false);
    }
  };

  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmarEntrega = async () => {
    if (!encomiendaId) return;
    setIsConfirming(true);
    
    try {
      const result = await confirmarEntrega(encomiendaId);
      
      if (result.success) {
        toast.success(`✅ Encomienda ${encomienda.tracking_id} entregada exitosamente`);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Error al confirmar la entrega");
      }
    } catch (err) {
      toast.error("Ocurrió un error inesperado al confirmar");
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {loading || !encomienda ? (
          <div className="flex flex-col items-center justify-center h-[400px]">
            <Spinner size="lg" />
            <span className="text-muted-foreground mt-4 font-medium">Cargando información segura...</span>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Package className="text-primary" weight="duotone" />
                Entrega: <span className="font-mono tracking-wider ml-1">{encomienda.tracking_id}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-2">
              {/* SECCIÓN 1: Información del Envío */}
              <div className="rounded-md border p-4 bg-muted/20">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-foreground/80 uppercase tracking-wider">
                  <IdentificationCard size={18} />
                  Información del Envío
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <User size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Remitente</span>
                      <span className="font-medium">{encomienda.sender?.nombre_completo || "Desconocido"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Destinatario</span>
                      <span className="font-medium">{encomienda.receiver_nombre} | {encomienda.receiver_cedula_rif}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Teléfono</span>
                      <span>{encomienda.receiver_telefono}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Package size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Contenido</span>
                      <span className="truncate max-w-[200px] block">{encomienda.descripcion_contenido || "N/A"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Scale size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Peso / Costo</span>
                      <span className="font-medium">{encomienda.peso_kg || 0} kg | ${encomienda.costo_calculado?.toFixed(2) || "0.00"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Warning size={16} className="text-muted-foreground mt-0.5" />
                    <div>
                      <span className="block text-muted-foreground text-xs">Tiempo en oficina</span>
                      <span className="font-medium">{diasEnOficina(encomienda.updated_at)} días</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: Cobro en Destino */}
              {encomienda.modalidad_pago === "DESTINO" && (
                <div className="rounded-md border p-4 bg-muted/20">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-foreground/80 uppercase tracking-wider">
                    <CurrencyDollar size={18} />
                    Cobro en Destino
                  </h4>
                  
                  {pagoOk ? (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 p-3 rounded-md">
                      <CheckCircle size={20} weight="fill" />
                      <span className="font-medium">Pago verificado correctamente</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <div className="flex items-center gap-2 text-amber-800">
                          <Warning size={20} weight="fill" />
                          <span className="font-medium">Cobro pendiente: ${encomienda.costo_calculado?.toFixed(2)}</span>
                        </div>
                      </div>

                      {pagoPendiente && (
                        <div className="text-sm bg-background p-3 rounded border">
                          <p className="font-medium mb-1">Pago reportado por el cliente:</p>
                          <p className="text-muted-foreground">Banco: {pagoPendiente.banco_emisor}</p>
                          <p className="text-muted-foreground">Referencia: {pagoPendiente.numero_referencia}</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <Button 
                          variant="default" 
                          className="flex-1 gap-2"
                          onClick={() => handleAprobarPago("DIGITAL")}
                          disabled={isProcessingPago}
                        >
                          <Money size={18} />
                          {pagoPendiente ? "Aprobar Pago Digital" : "Registrar Pago Digital"}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="flex-1 gap-2"
                          onClick={() => handleAprobarPago("EFECTIVO")}
                          disabled={isProcessingPago}
                        >
                          <Money size={18} />
                          Cobrado en Efectivo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECCIÓN 3: Validación de PIN (Tarea 6) */}
              <div className="rounded-md border p-4 bg-muted/20">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-foreground/80 uppercase tracking-wider">
                  <LockKey size={18} />
                  Validación de Seguridad
                </h4>
                <div className="p-4 bg-background border border-dashed rounded-md">
                  <PinInput
                    encomiendaId={encomienda.id}
                    initialIntentos={intentos}
                    initialBloqueado={pinBloqueado}
                    onSuccess={() => setPinOk(true)}
                    onBlocked={() => {
                      setPinBloqueado(true);
                      setPinOk(false);
                    }}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6 border-t pt-4">
              <Button variant="ghost" onClick={onClose} disabled={isConfirming}>
                Cancelar
              </Button>
              <Button 
                disabled={!pagoOk || !pinOk || isConfirming} 
                className="gap-2"
                onClick={handleConfirmarEntrega}
              >
                {isConfirming ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle size={18} weight="bold" />}
                Confirmar Entrega
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
