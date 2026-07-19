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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from "@phosphor-icons/react";
import { rechazarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface RechazarDialogProps {
  cooperativaId: string;
  nombre: string;
  trigger?: React.ReactNode;
}

export function RechazarDialog({ cooperativaId, nombre, trigger }: RechazarDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!motivo || motivo.trim().length === 0) {
      toast.error("Por favor ingrese el motivo del rechazo.");
      return;
    }

    setLoading(true);

    try {
      const res = await rechazarSolicitud(cooperativaId, motivo);
      if (res.success) {
        toast.success(`Solicitud de "${nombre}" rechazada.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al rechazar la solicitud.");
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
          <Button variant="outline" className="border-rose-500/25 text-rose-500 hover:bg-rose-500/10 gap-2 cursor-pointer font-sans">
            <X className="h-4 w-4" /> Rechazar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-popover text-popover-foreground font-sans">
        <DialogHeader>
          <DialogTitle>Rechazar Solicitud de Registro</DialogTitle>
          <DialogDescription>
            Indica el motivo por el cual estás rechazando la solicitud. Se enviará un correo explicativo a la cooperativa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cooperativa:</span>
              <span className="font-semibold">{nombre}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo_rechazo">Motivo del Rechazo</Label>
            <Textarea
              id="motivo_rechazo"
              required
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El número de RIF ingresado no corresponde a la cooperativa registrada..."
              className="bg-background resize-none font-sans"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
              variant="destructive"
              disabled={loading}
              className="cursor-pointer"
            >
              {loading ? "Procesando..." : "Confirmar Rechazo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
