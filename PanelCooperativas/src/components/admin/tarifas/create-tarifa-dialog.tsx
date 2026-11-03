"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Warning, CurrencyDollar, Scales, Ruler, Calendar } from "@phosphor-icons/react";
import { createTarifa } from "@/app/admin/(panel)/tarifas/actions";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errores";
import { useRouter } from "next/navigation";
import { ZONA_VE } from "@/lib/fechas";

export function CreateTarifaDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Helper to get current datetime formatted for input (YYYY-MM-DDTHH:MM)
  // en hora de Venezuela (el servidor la interpreta igual), sin importar la zona del navegador.
  const getCurrentDateTimeString = () => {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA_VE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await createTarifa(formData);
      
      if (!res.success) {
        toast.error(res.error || "No pudimos crear la tarifa. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      toast.success("Tarifa creada. Ya es la vigente.");
      router.refresh();
      setOpen(false);
    } catch (err) {
      toast.error(humanizeError(err, "crear la tarifa"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!loading) setOpen(v);
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> Nueva tarifa
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Nueva tarifa</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Establece los nuevos parámetros globales de facturación para encomiendas.
            </DialogDescription>
          </DialogHeader>

          {/* Warning Banner */}
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-600/30 text-amber-950 text-sm dark:bg-amber-400/10 dark:text-amber-100">
            <Warning weight="fill" className="size-5 shrink-0 text-warning-text" aria-hidden />
            <div className="leading-relaxed">
              Al crearla, esta tarifa reemplaza a la vigente y la actual pasa al historial. No se puede deshacer.
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="tarifa_por_kg" className="text-xs flex items-center gap-1.5">
                <CurrencyDollar className="size-4 text-muted-foreground" aria-hidden /> Tarifa por kilogramo (USD)
              </Label>
              <Input 
                id="tarifa_por_kg" 
                name="tarifa_por_kg" 
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ej: 2.50" 
                required
                className="bg-background text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="factor_distancia_por_min" className="text-xs flex items-center gap-1.5">
                <CurrencyDollar className="size-4 text-muted-foreground" aria-hidden /> Factor de distancia por minuto
              </Label>
              <Input 
                id="factor_distancia_por_min" 
                name="factor_distancia_por_min" 
                type="number"
                step="0.0001"
                min="0"
                placeholder="Ej: 0.0050" 
                required
                className="bg-background text-sm"
              />
              <p className="text-xs text-muted-foreground leading-snug">
                Representa el recargo porcentual por cada minuto de viaje (0.0050 = +0.50% / min).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="peso_max_kg" className="text-xs flex items-center gap-1.5">
                  <Scales className="size-4 text-muted-foreground" aria-hidden /> Peso máximo (kg)
                </Label>
                <Input 
                  id="peso_max_kg" 
                  name="peso_max_kg" 
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Ej: 25.0" 
                  required
                  className="bg-background text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dimensiones_max_cm" className="text-xs flex items-center gap-1.5">
                  <Ruler className="size-4 text-muted-foreground" aria-hidden /> Dimensión máxima (cm)
                </Label>
                <Input 
                  id="dimensiones_max_cm" 
                  name="dimensiones_max_cm" 
                  type="number"
                  step="1"
                  min="1"
                  placeholder="Ej: 50" 
                  required
                  className="bg-background text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="vigente_desde" className="text-xs flex items-center gap-1.5">
                <Calendar className="size-4 text-muted-foreground" aria-hidden /> Vigente desde
              </Label>
              <Input 
                id="vigente_desde" 
                name="vigente_desde" 
                type="datetime-local" 
                defaultValue={getCurrentDateTimeString()}
                required
                className="bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
              
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? "Creando…" : "Crear tarifa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
