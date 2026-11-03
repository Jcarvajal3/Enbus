"use client";

// ─── No recibir una encomienda (P-31, PC-28) ────────────────────────────────
// Irreversible y con impacto en el cliente: ConfirmDialog con motivo
// obligatorio (se le envía al cliente) → fn_rechazar_encomienda_origen.

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import type { Encomienda } from "@/lib/types/encomiendas";
import { rechazarEncomienda } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";

export const MOTIVOS_NO_RECIBIR = [
  "No tenemos ruta a ese destino",
  "Contenido no permitido",
  "Paquete mal embalado",
  "Excede el peso o el tamaño",
];

type Props = {
  encomienda: Pick<Encomienda, "id" | "tracking_id" | "ciudad_destino" | "origen_registro"> | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** La encomienda quedó cancelada. */
  onRechazada?(): void;
  /** Motivo preseleccionado (p. ej. sin ruta). */
  motivoSugerido?: string;
};

export function RechazarEncomiendaDialog({ encomienda, open, onOpenChange, onRechazada, motivoSugerido }: Props) {
  if (!encomienda) return null;
  // En el alta presencial el cliente no tiene la app: el aviso lo da la taquilla.
  const presencial = encomienda.origen_registro === "TAQUILLA";
  const chips = motivoSugerido
    ? [motivoSugerido, ...MOTIVOS_NO_RECIBIR.filter((m) => m !== motivoSugerido)]
    : MOTIVOS_NO_RECIBIR;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titulo={`¿No recibir la encomienda ${encomienda.tracking_id}?`}
      descripcion="Úsalo cuando el paquete no puede salir desde tu taquilla. No se puede deshacer."
      impacto={[
        "La encomienda queda cancelada y no se podrá despachar ni cobrar.",
        presencial
          ? "Explícale el motivo al cliente antes de que se vaya."
          : "Le avisaremos al cliente en la app con el motivo que escribas.",
      ]}
      motivo={{
        etiqueta: "¿Por qué no la recibes?",
        placeholder: "Por ejemplo: no tenemos ruta a Maturín.",
        minimo: 5,
        chips,
      }}
      verbo="No recibir la encomienda"
      verboCargando="Cancelando…"
      tono="destructive"
      textoCancelar="Volver"
      onConfirm={async (motivo) => {
        try {
          const res = await requireOnline(() => rechazarEncomienda(encomienda.id, motivo ?? ""))();
          if (!res.success) return { ok: false, error: res.error };
          toast.success(
            res.data.ya_procesado
              ? "Esta encomienda ya estaba cancelada."
              : presencial
                ? "Encomienda rechazada. Explícale el motivo al cliente."
                : "Encomienda rechazada. Le avisamos al cliente."
          );
          onRechazada?.();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: humanizeError(err, "rechazar la encomienda") };
        }
      }}
    />
  );
}
