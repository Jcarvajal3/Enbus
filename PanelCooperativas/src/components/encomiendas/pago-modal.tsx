"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Encomienda, Pago } from "@/lib/types/encomiendas";
import { procesarPago } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";

interface PagoModalProps {
  encomienda: Encomienda;
  cooperativaId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (encomiendaId: string) => void;
}

export function PagoModal({ encomienda, cooperativaId, isOpen, onClose, onSuccess }: PagoModalProps) {
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [pagoDigital, setPagoDigital] = useState<Pago | null>(null);
  const [submitting, setSubmitting] = useState<"DIGITAL" | "EFECTIVO" | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    
    async function loadPago() {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("pagos")
        .select("*")
        .eq("encomienda_id", encomienda.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (error) {
        console.error("Error al cargar pago:", error);
      }
      
      if (isMounted) {
        setPagoDigital(data as Pago | null);
        setLoading(false);
      }
    }
    
    loadPago();
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, encomienda.id, supabase]);

  const handleProcesar = async (tipo: "DIGITAL" | "EFECTIVO") => {
    if (!navigator.onLine) {
      toast.error("Esta operación requiere conexión a internet. Por favor, intente de nuevo cuando se restablezca la conexión.");
      return;
    }
    if (!encomienda.costo_calculado) return;
    
    setSubmitting(tipo);
    try {
      const pagoExistenteId = tipo === "DIGITAL" && pagoDigital ? pagoDigital.id : undefined;
      
      const res = await procesarPago(
        encomienda.id,
        tipo,
        encomienda.costo_calculado,
        cooperativaId,
        pagoExistenteId
      );
      
      if (res.success) {
        toast.success(tipo === "EFECTIVO" ? "Cobro en efectivo registrado" : "Pago digital aprobado");
        // Always requires photo after this per the task requirements
        onSuccess(encomienda.id);
        onClose();
      } else {
        toast.error(res.error || "Error al procesar el pago");
      }
    } catch (err) {
      toast.error("Ocurrió un error inesperado al procesar el pago");
      console.error(err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !submitting) {
      onClose();
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateString));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Verificación de Pago</DialogTitle>
          <DialogDescription>
            Confirma la recepción del pago de esta encomienda para continuar con el proceso.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Sección 1: Resumen (read-only) */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/40 p-4 rounded-lg border">
            <div>
              <p className="text-muted-foreground font-medium mb-1">Tracking ID</p>
              <p className="font-mono font-medium text-foreground">{encomienda.tracking_id}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-1">Peso</p>
              <p className="font-medium text-foreground">{encomienda.peso_kg ? `${encomienda.peso_kg} kg` : "N/A"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-1">Remitente</p>
              <p className="font-medium text-foreground truncate">{encomienda.sender?.nombre_completo || "Desconocido"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-1">Destinatario</p>
              <p className="font-medium text-foreground truncate">{encomienda.receiver_nombre}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground font-medium mb-1">Ruta</p>
              <p className="font-medium text-foreground">{encomienda.ciudad_origen} → {encomienda.ciudad_destino}</p>
            </div>
            <div className="col-span-2 flex justify-between items-center bg-primary/5 p-3 rounded-md border border-primary/10 mt-2">
              <span className="font-semibold">Monto a Cobrar:</span>
              <span className="text-2xl font-bold tracking-tight text-primary">
                ${encomienda.costo_calculado?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>

          {/* Sección 2: Datos de pago del cliente */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center">
              Pago Reportado por el Cliente
            </h4>
            
            {loading ? (
              <div className="flex justify-center items-center py-6 border rounded-lg bg-muted/20">
                <Spinner size="sm" />
                <span className="ml-2 text-sm text-muted-foreground">Buscando pagos...</span>
              </div>
            ) : pagoDigital ? (
              <div className="grid grid-cols-2 gap-3 text-sm bg-card p-4 rounded-lg border shadow-sm">
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Banco Emisor</p>
                  <p className="font-medium text-foreground uppercase">{pagoDigital.banco_emisor || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Monto Reportado</p>
                  <p className="font-medium text-foreground">${pagoDigital.monto?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Nº Referencia</p>
                  <p className="font-mono font-medium text-foreground">{pagoDigital.numero_referencia || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Fecha</p>
                  <p className="font-medium text-foreground">{formatDate(pagoDigital.fecha_transaccion)}</p>
                </div>
                
                <div className="col-span-2 mt-2 pt-3 border-t">
                  <Button 
                    className="w-full" 
                    onClick={() => handleProcesar("DIGITAL")}
                    disabled={!!submitting}
                  >
                    {submitting === "DIGITAL" ? (
                      <><Spinner className="mr-2" size="sm" /> Procesando...</>
                    ) : (
                      "Aprobar Pago Digital"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 border rounded-lg border-dashed bg-muted/20 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  El cliente aún no ha confirmado pago desde la app
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center border-t pt-4">
          <Button 
            variant="outline" 
            onClick={() => handleProcesar("EFECTIVO")}
            disabled={!!submitting}
            className="border-primary/20 hover:bg-primary/5 text-foreground"
          >
            {submitting === "EFECTIVO" ? (
              <><Spinner className="mr-2" size="sm" /> Procesando...</>
            ) : (
              "Cobrado en Efectivo"
            )}
          </Button>
          
          <Button variant="ghost" onClick={onClose} disabled={!!submitting}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
