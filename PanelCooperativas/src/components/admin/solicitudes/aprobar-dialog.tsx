"use client";

import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, SpinnerIcon, WarningCircle } from "@phosphor-icons/react";
import { aprobarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { humanizeError } from "@/lib/errores";
import { formatNumeroVE } from "@/lib/dinero";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface AprobarDialogProps {
  cooperativaId: string;
  nombre: string;
  rif: string;
  trigger?: React.ReactNode;
  /** Se llama tras aprobar (p. ej. para cerrar la hoja lateral). */
  onHecho?: () => void;
}

/** Copia el mensaje para avisar por otro medio cuando el correo no salió. */
function avisoSinCorreo(texto: string, mensaje: string) {
  toast.warning(texto, {
    duration: 15000,
    action: {
      label: "Copiar mensaje",
      onClick: () => {
        navigator.clipboard.writeText(mensaje).then(
          () => toast.success("Mensaje copiado."),
          () => toast.error("No pudimos copiar el mensaje. Selecciónalo y cópialo a mano.")
        );
      },
    },
  });
}

export function AprobarDialog({ cooperativaId, nombre, rif, trigger, onHecho }: AprobarDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comision, setComision] = useState("10");
  const [error, setError] = useState<string | null>(null);

  const comisionNum = Number(comision.replace(",", "."));
  const comisionValida = comision.trim() !== "" && Number.isFinite(comisionNum) && comisionNum >= 0 && comisionNum <= 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!comisionValida) {
      setError("Escribe una comisión entre 0 y 100 %.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await aprobarSolicitud(cooperativaId, comisionNum);
      if (!res.success) {
        setError(res.error || "No pudimos aprobar la solicitud. Intenta de nuevo.");
        return;
      }
      if (res.emailEnviado) {
        toast.success(`${nombre} quedó activa. Le avisamos por correo a ${res.email}.`);
      } else {
        avisoSinCorreo(
          res.email
            ? `${nombre} quedó activa, pero no pudimos enviar el correo a ${res.email}. Avísale por otro medio.`
            : `${nombre} quedó activa, pero no tiene correo registrado. Avísale por otro medio.`,
          `Hola. Aprobamos a ${nombre} en EnBus con una comisión de ${formatNumeroVE(comisionNum)} %. Ya puedes vender desde tu panel.`
        );
      }
      setOpen(false);
      onHecho?.();
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "aprobar la solicitud"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return;
        setOpen(v);
        if (v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-1.5">
            <Check className="size-4" aria-hidden /> Aprobar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aprobar solicitud</DialogTitle>
          <DialogDescription>
            La cooperativa quedará activa y podrá vender en la app. Le avisaremos por correo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <dl className="space-y-2 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cooperativa</dt>
              <dd className="text-right font-semibold">{nombre}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">RIF</dt>
              <dd className="font-mono font-semibold">{rif}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <Label htmlFor={`${uid}-comision`}>Comisión de EnBus (%)</Label>
            <Input
              id={`${uid}-comision`}
              inputMode="decimal"
              autoFocus
              required
              value={comision}
              disabled={loading}
              aria-invalid={error && !comisionValida ? true : undefined}
              aria-describedby={`${uid}-ayuda`}
              onChange={(e) => {
                setComision(e.target.value);
                if (error) setError(null);
              }}
              placeholder="10"
            />
            <p id={`${uid}-ayuda`} className="text-xs text-muted-foreground">
              {comisionValida
                ? `Por cada Bs 100 vendidos, EnBus recibe Bs ${formatNumeroVE(comisionNum)}.`
                : "Se cobra sobre cada boleto y encomienda vendidos en la plataforma."}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
            >
              <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
              <p>{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
              {loading && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
              {loading ? "Aprobando…" : "Aprobar y avisar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { avisoSinCorreo };
