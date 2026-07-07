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
import { useRouter } from "next/navigation";

export function CreateTarifaDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Helper to get current datetime formatted for input (YYYY-MM-DDTHH:MM)
  const getCurrentDateTimeString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1000);
    return localNow.toISOString().slice(0, 16);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await createTarifa(formData);
      
      if (!res.success) {
        toast.error(res.error || "Ocurrió un error al crear la tarifa");
        setLoading(false);
        return;
      }

      toast.success("Nueva tarifa creada e instalada como vigente");
      router.refresh();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Error de red o del servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!loading) setOpen(v);
    }}>
      <DialogTrigger asChild>
        <Button className="bg-orange-600 hover:bg-orange-500 text-white font-medium shadow-lg shadow-orange-950/20">
          <Plus className="mr-2 h-4 w-4 font-bold" /> Nueva Tarifa
        </Button>
      </DialogTrigger>
      
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-lg font-bold">Configurar Nueva Tarifa</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Establece los nuevos parámetros globales de facturación para encomiendas.
            </DialogDescription>
          </DialogHeader>

          {/* Warning Banner */}
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            <Warning weight="fill" className="size-5 shrink-0 text-amber-500" />
            <div className="leading-relaxed">
              <span className="font-bold">Advertencia:</span> Al activar esta nueva tarifa, la tarifa vigente actual pasará al historial de forma automática e irreversible.
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="tarifa_por_kg" className="text-slate-300 text-xs flex items-center gap-1.5">
                <CurrencyDollar className="size-4 text-orange-500" /> Tarifa base por Kilogramo (USD)
              </Label>
              <Input 
                id="tarifa_por_kg" 
                name="tarifa_por_kg" 
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ej: 2.50" 
                required
                className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-orange-500 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="factor_distancia_por_min" className="text-slate-300 text-xs flex items-center gap-1.5">
                <CurrencyDollar className="size-4 text-orange-500" /> Factor de distancia por minuto
              </Label>
              <Input 
                id="factor_distancia_por_min" 
                name="factor_distancia_por_min" 
                type="number"
                step="0.0001"
                min="0"
                placeholder="Ej: 0.0050" 
                required
                className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-orange-500 text-sm"
              />
              <p className="text-[10px] text-muted-foreground leading-snug">
                Representa el recargo porcentual por cada minuto de viaje (0.0050 = +0.50% / min).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="peso_max_kg" className="text-slate-300 text-xs flex items-center gap-1.5">
                  <Scales className="size-4 text-orange-500" /> Peso Máximo (kg)
                </Label>
                <Input 
                  id="peso_max_kg" 
                  name="peso_max_kg" 
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Ej: 25.0" 
                  required
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-orange-500 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dimensiones_max_cm" className="text-slate-300 text-xs flex items-center gap-1.5">
                  <Ruler className="size-4 text-orange-500" /> Dimensión Máx (cm)
                </Label>
                <Input 
                  id="dimensiones_max_cm" 
                  name="dimensiones_max_cm" 
                  type="number"
                  step="1"
                  min="1"
                  placeholder="Ej: 50" 
                  required
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-orange-500 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="vigente_desde" className="text-slate-300 text-xs flex items-center gap-1.5">
                <Calendar className="size-4 text-orange-500" /> Fecha de Vigencia
              </Label>
              <Input 
                id="vigente_desde" 
                name="vigente_desde" 
                type="datetime-local" 
                defaultValue={getCurrentDateTimeString()}
                required
                className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-orange-500 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-900">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
              className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300 text-xs py-1.5"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs py-1.5"
            >
              {loading ? "Registrando..." : "Crear e Instalar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
