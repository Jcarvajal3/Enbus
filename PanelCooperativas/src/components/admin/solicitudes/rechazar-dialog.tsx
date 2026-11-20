"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rechazarSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { avisarExito } from "@/lib/avisos";
import { avisoSinCorreo } from "./aprobar-dialog";

interface RechazarDialogProps {
  cooperativaId: string;
  nombre: string;
  open: boolean;
  onOpenChange(open: boolean): void;
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
export function RechazarDialog({ cooperativaId, nombre, open, onOpenChange, onHecho }: RechazarDialogProps) {
  const router = useRouter();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titulo={`¿Rechazar la solicitud de ${nombre}?`}
      descripcion="Recibirá el motivo por correo y en su panel. Podrá corregir sus datos y pedir otra revisión."
      motivo={{
        etiqueta: "Motivo del rechazo",
        placeholder: "Ej. El RIF no corresponde a la cooperativa registrada.",
        chips: MOTIVOS_RECHAZO,
      }}
      verbo="Rechazar y avisar"
      verboCargando="Rechazando…"
      tono="destructive"
      onConfirm={async (motivo) => {
        const res = await rechazarSolicitud(cooperativaId, motivo ?? "");
        if (!res.success) return { ok: false, error: res.error };
        if (res.emailEnviado) {
          avisarExito(`Solicitud de ${nombre} rechazada. Le enviamos el motivo a ${res.email}.`);
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
  );
}
