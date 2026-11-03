"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Key } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { desbloquearPinEncomienda } from "@/app/admin/(panel)/encomiendas/actions";

/** "Desbloquear PIN" con motivo (fn_desbloquear_pin). */
export function DesbloquearPinButton({ encomiendaId, tracking }: { encomiendaId: string; tracking: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Key className="h-4 w-4" aria-hidden /> Desbloquear PIN
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        titulo={`¿Desbloquear el PIN de ${tracking}?`}
        descripcion="Quien retira podrá intentar el PIN otra vez (hasta 10 intentos). Hazlo solo si confirmaste su identidad."
        motivo={{
          etiqueta: "Motivo",
          placeholder: "Por ejemplo: el destinatario confirmó su cédula por WhatsApp.",
          chips: ["Destinatario verificado por teléfono", "Se equivocó al escribir el PIN", "Lo pidió la cooperativa", "Otro"],
        }}
        verbo="Desbloquear PIN"
        verboCargando="Desbloqueando…"
        onConfirm={async (motivo) => {
          const res = await desbloquearPinEncomienda(encomiendaId, motivo ?? "");
          if (!res.success) return { ok: false, error: res.error };
          toast.success(`PIN de ${tracking} desbloqueado. Ya se puede intentar de nuevo en la taquilla.`);
          router.refresh();
          return { ok: true };
        }}
      />
    </>
  );
}
