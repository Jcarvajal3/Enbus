"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rechazarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { avisoSinCorreo } from "./aprobar-dialog";

interface RechazarDialogProps {
  cooperativaId: string;
  nombre: string;
  /** Se llama tras rechazar (p. ej. para cerrar la hoja lateral). */
  onHecho?: () => void;
}

const MOTIVOS_RECHAZO = [
  "RIF inválido o incompleto",
  "Datos de contacto incompletos",
  "No pudimos verificar la cooperativa",
  "Documentación pendiente",
  "Otro",
];

/** Rechazo reversible (#37): la cooperativa recibe el motivo y puede pedir una nueva revisión. */
export function RechazarDialog({ cooperativaId, nombre, onHecho }: RechazarDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-destructive/40 text-destructive-text hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <X className="size-4" aria-hidden /> Rechazar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        titulo={`¿Rechazar la solicitud de ${nombre}?`}
        descripcion="La cooperativa recibirá el motivo por correo y lo verá en su panel. Podrá corregir sus datos y pedir una nueva revisión."
        motivo={{
          etiqueta: "Motivo del rechazo",
          placeholder: "Por ejemplo: el RIF no corresponde a la cooperativa registrada.",
          chips: MOTIVOS_RECHAZO,
        }}
        verbo="Rechazar y avisar"
        verboCargando="Rechazando…"
        tono="destructive"
        onConfirm={async (motivo) => {
          const res = await rechazarSolicitud(cooperativaId, motivo ?? "");
          if (!res.success) return { ok: false, error: res.error };
          if (res.emailEnviado) {
            toast.success(`Solicitud de ${nombre} rechazada. Le enviamos el motivo por correo a ${res.email}.`);
          } else {
            avisoSinCorreo(
              res.email
                ? `Solicitud de ${nombre} rechazada, pero no pudimos enviar el correo a ${res.email}. Avísale por otro medio.`
                : `Solicitud de ${nombre} rechazada, pero no tiene correo registrado. Avísale por otro medio.`,
              `Hola. Revisamos la solicitud de ${nombre} en EnBus y por ahora no pudimos aprobarla. Motivo: ${(motivo ?? "").replace(/\.+$/, "")}. Corrige tus datos en tu panel y pide una nueva revisión.`
            );
          }
          onHecho?.();
          router.refresh();
          return { ok: true };
        }}
      />
    </>
  );
}
