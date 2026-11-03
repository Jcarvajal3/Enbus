"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AvisoError } from "@/components/aviso-error";
import { CampoComision, ERROR_COMISION, leerComision } from "@/components/admin/cooperativas/campo-comision";
import { aprobarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { humanizeError } from "@/lib/errores";
import { avisarError, avisarExito } from "@/lib/avisos";
import { formatNumeroVE } from "@/lib/dinero";

interface AprobarDialogProps {
  cooperativaId: string;
  nombre: string;
  rif: string;
  /** Botón que abre el diálogo. */
  trigger: React.ReactElement;
  /** Se llama tras aprobar (p. ej. para cerrar la hoja lateral). */
  onHecho?: () => void;
}

/** Aviso de "no salió el correo" con el mensaje listo para copiar y enviarlo por otro medio. */
export function avisoSinCorreo(texto: string, mensaje: string) {
  toast.warning(texto, {
    duration: 15000,
    closeButton: true,
    action: {
      label: "Copiar mensaje",
      onClick: () => {
        navigator.clipboard.writeText(mensaje).then(
          () => avisarExito("Mensaje copiado."),
          () => avisarError("No pudimos copiar el mensaje. Selecciónalo y cópialo a mano.")
        );
      },
    },
  });
}

export function AprobarDialog({ cooperativaId, nombre, rif, trigger, onHecho }: AprobarDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comision, setComision] = useState("10");
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const comisionNum = leerComision(comision);
    if (!Number.isFinite(comisionNum)) {
      setErrorCampo(ERROR_COMISION);
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
        avisarExito(`${nombre} quedó activa. Le avisamos por correo a ${res.email}.`);
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
        if (v) {
          setError(null);
          setErrorCampo(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent tamano="confirmar">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Aprobar solicitud</DialogTitle>
            <DialogDescription>Quedará activa y podrá vender en la app. Le avisaremos por correo.</DialogDescription>
          </DialogHeader>

          <dl className="flex flex-col gap-2 rounded-md bg-muted p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cooperativa</dt>
              <dd className="text-right font-medium">{nombre}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">RIF</dt>
              <dd className="font-mono font-medium">{rif}</dd>
            </div>
          </dl>

          <CampoComision
            valor={comision}
            autoFocus
            disabled={loading}
            error={errorCampo}
            onCambio={(v) => {
              setComision(v);
              setErrorCampo(null);
              setError(null);
            }}
          />

          {error && <AvisoError>{error}</AvisoError>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
              {loading && <Spinner size="sm" aria-hidden />}
              {loading ? "Aprobando…" : "Aprobar y avisar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
