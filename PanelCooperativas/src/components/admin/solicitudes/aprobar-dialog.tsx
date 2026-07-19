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
import { Check } from "@phosphor-icons/react";
import { aprobarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface AprobarDialogProps {
  cooperativaId: string;
  nombre: string;
  rif: string;
  trigger?: React.ReactNode;
}

export function AprobarDialog({ cooperativaId, nombre, rif, trigger }: AprobarDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comision, setComision] = useState("10.00");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const comisionNum = parseFloat(comision);
    if (isNaN(comisionNum) || comisionNum < 0 || comisionNum > 100) {
      toast.error("Por favor ingrese un porcentaje de comisión válido entre 0 y 100.");
      setLoading(false);
      return;
    }

    try {
      const res = await aprobarSolicitud(cooperativaId, comisionNum);
      if (res.success) {
        toast.success(`Cooperativa "${nombre}" aprobada exitosamente.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al aprobar la cooperativa.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al comunicarse con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 cursor-pointer">
            <Check className="h-4 w-4" /> Aprobar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle>Aprobar Registro de Cooperativa</DialogTitle>
          <DialogDescription>
            Establece el porcentaje de comisión para activar la cooperativa en la plataforma.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Cooperativa:</span>
              <span className="font-semibold font-sans">{nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">RIF:</span>
              <span className="font-semibold font-mono">{rif}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comision_porcentaje" className="font-sans">Porcentaje de Comisión (%)</Label>
            <Input
              id="comision_porcentaje"
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              value={comision}
              onChange={(e) => setComision(e.target.value)}
              placeholder="Ej. 10.00"
              className="bg-background font-sans"
            />
            <p className="text-[11px] text-muted-foreground font-sans">
              Este porcentaje se cobrará automáticamente por cada pasaje vendido y encomienda enviada.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 font-sans">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              disabled={loading}
            >
              {loading ? "Aprobando..." : "Confirmar Aprobación"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
