"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { Encomienda } from "@/lib/types/encomiendas";
import { confirmarRecepcion } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { printGuiaEncomienda } from "@/lib/printing/print-helpers";
import { printer } from "@/lib/printing/bluetooth";
import { requireOnline } from "@/components/connectivity-banner";

function normalizeForDb(val: string | null | undefined): string {
  if (!val) return "";
  const clean = val.trim().toLowerCase();
  if (clean === "san fernando de apure") return "san_fernando";
  if (clean === "san juan de los morros") return "san_juan";
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

interface RecepcionModalProps {
  encomienda: Encomienda;
  cooperativaId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RecepcionModal({ encomienda, cooperativaId, isOpen, onClose, onSuccess }: RecepcionModalProps) {
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [ruta, setRuta] = useState<{ id: string; duracion_estimada_min: number } | null>(null);
  
  const [peso, setPeso] = useState<string>("");
  const [pesoError, setPesoError] = useState<string>("");
  
  const [calculating, setCalculating] = useState(false);
  const [costoCalculado, setCostoCalculado] = useState<number | null>(null);
  
  const [submitting, setSubmitting] = useState(false);

  // 1. Validaciones al abrir
  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    
    async function validate() {
      if (encomienda.estado !== "PENDIENTE_DE_ESCANEO") {
        toast.error("Esta encomienda ya fue procesada");
        onClose();
        return;
      }
      
      setLoading(true);
      
      const { data, error } = await supabase
        .from("rutas")
        .select("id, duracion_estimada_min")
        .eq("cooperativa_id", cooperativaId)
        .eq("activa", true)
        .eq("estado_destino", normalizeForDb(encomienda.estado_destino))
        .eq("ciudad_destino", normalizeForDb(encomienda.ciudad_destino))
        .limit(1)
        .maybeSingle();
        
      if (error || !data) {
        toast.error("No hay ruta activa al destino seleccionado");
        onClose();
        return;
      }
      
      if (isMounted) {
        setRuta(data);
        setLoading(false);
      }
    }
    
    validate();
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, encomienda, cooperativaId, onClose, supabase]);

  // Reset form state when modal closes — setState in effect is intentional (cleanup pattern)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) {
      setPeso("");
      setPesoError("");
      setCostoCalculado(null);
      setRuta(null);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounce y cálculo de costo en tiempo real
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!peso || isNaN(Number(peso)) || Number(peso) <= 0 || !ruta) {
      setCostoCalculado(null);
      setPesoError("");
      return;
    }

    const numPeso = Number(peso);
    if (numPeso > 25) {
      setPesoError("Peso máximo: 25 kg");
      setCostoCalculado(null);
      return;
    } else {
      setPesoError("");
    }

    const timer = setTimeout(async () => {
      setCalculating(true);
      try {
        const { data, error } = await supabase.functions.invoke("calcular-costo-encomienda", {
          body: {
            encomienda_id: encomienda.id,
            peso_kg: numPeso,
            preview: true
          },
        });
        
        if (error) {
          let details = "";
          try {
            if (error.context && typeof error.context.text === "function") {
              details = await error.context.text();
            } else if (error.context) {
              details = typeof error.context === "string" ? error.context : JSON.stringify(error.context);
            }
          } catch (_) {}
          const errorMsg = details ? `${error.message}: ${details}` : error.message;
          throw new Error(errorMsg);
        }

        // Guard against undefined/NaN in case Edge Function schema changes
        const costo = Number(data?.costo);
        if (!isNaN(costo) && costo > 0) {
          setCostoCalculado(costo);
        } else {
          toast.error("Respuesta inválida del cálculo de costo");
          setCostoCalculado(null);
        }
      } catch (err) {
        console.error("Error calculando costo:", err);
        const errMsg = err instanceof Error ? err.message : "Error al calcular el costo";
        toast.error(errMsg);
        setCostoCalculado(null);
      } finally {
        setCalculating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [peso, ruta, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (!costoCalculado || !peso || Number(peso) <= 0 || Number(peso) > 25) return;
    
    setSubmitting(true);
    try {
      const res = await requireOnline(() => confirmarRecepcion(encomienda.id, Number(peso), costoCalculado))();
      
      if (res.success) {
        toast.success("Recepción confirmada con éxito");
        
        // Impresión automática de la guía vía Bluetooth si está conectada (M-02)
        if (printer.isConnected) {
          try {
            await printGuiaEncomienda({
              ...encomienda,
              peso_kg: Number(peso),
              costo_calculado: costoCalculado
            });
            toast.success("Etiqueta de guía enviada a la impresora térmica Bluetooth");
          } catch (printErr) {
            console.error("Error al imprimir etiqueta Bluetooth:", printErr);
            toast.warning("Recepción registrada pero falló la impresión automática.");
            if (res.pdfUrl) {
              window.open(res.pdfUrl, "_blank");
            }
          }
        } else {
          // Si no hay impresora Bluetooth conectada, se abre el PDF en una pestaña nueva para impresión estándar
          if (res.pdfUrl) {
            window.open(res.pdfUrl, "_blank");
            toast.info("Abriendo guía en formato PDF para impresión estándar.");
          }
        }
        
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || "Ocurrió un error al confirmar la recepción");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !submitting) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Recepción de Encomienda</DialogTitle>
          <DialogDescription>
            Verifica los datos del envío e ingresa el peso para procesar la recepción.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-12">
            <Spinner size="lg" />
            <span className="mt-4 text-muted-foreground font-medium">Validando ruta...</span>
          </div>
        ) : (
          <div className="grid gap-6 py-4">
            {/* Sección 1: Info read-only */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/40 p-4 rounded-lg border">
              <div>
                <p className="text-muted-foreground font-medium mb-1">Tracking ID</p>
                <p className="font-mono font-medium text-foreground">{encomienda.tracking_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Modalidad de Pago</p>
                <Badge variant={encomienda.modalidad_pago === "ORIGEN" ? "default" : "secondary"}>
                  {encomienda.modalidad_pago}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Ruta</p>
                <p className="font-medium text-foreground">{encomienda.ciudad_origen} → {encomienda.ciudad_destino}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Remitente</p>
                <p className="font-medium text-foreground">{encomienda.sender?.nombre_completo || "Desconocido"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground font-medium mb-1">Destinatario</p>
                <p className="font-medium text-foreground">{encomienda.receiver_nombre} ({encomienda.receiver_telefono})</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground font-medium mb-1">Contenido Declarado</p>
                <p className="text-foreground">{encomienda.descripcion_contenido}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 items-start">
              {/* Sección 2: Formulario de pesaje */}
              <div className="space-y-3">
                <label htmlFor="peso" className="text-sm font-medium leading-none">
                  Peso (kg)
                </label>
                <Input
                  id="peso"
                  type="number"
                  step="0.01"
                  min="0"
                  max="25"
                  placeholder="0.00"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  className={pesoError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {pesoError && (
                  <p className="text-sm text-destructive font-medium animate-in fade-in">{pesoError}</p>
                )}
              </div>

              {/* Sección 3: Costo calculado */}
              <div className="bg-muted/50 p-4 rounded-lg border flex flex-col justify-center items-center text-center h-full min-h-[100px]">
                <p className="text-sm font-medium text-muted-foreground mb-1">Costo Calculado</p>
                {calculating ? (
                  <div className="mt-2"><Spinner size="md" /></div>
                ) : costoCalculado !== null ? (
                  <p className="text-4xl font-bold tracking-tight text-primary mt-1">
                    ${costoCalculado.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    Ingrese el peso para calcular
                  </p>
                )}
              </div>
            </div>

            {/* Sección 4: Alert informativa */}
            <Alert className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50">
              <WarningCircle className="h-5 w-5 !text-amber-600 dark:!text-amber-400" />
              <AlertTitle>Inspección Visual Requerida</AlertTitle>
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                Dimensiones máximas referenciales: 50 × 50 × 50 cm. Verifique visualmente el paquete antes de recibirlo.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!costoCalculado || !!pesoError || submitting || loading}
          >
            {submitting ? (
              <>
                <Spinner className="mr-2" size="sm" />
                Procesando...
              </>
            ) : (
              "Confirmar Recepción"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
