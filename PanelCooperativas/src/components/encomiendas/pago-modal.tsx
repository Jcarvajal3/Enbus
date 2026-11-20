"use client";

// ─── Cobro de una encomienda en un diálogo ──────────────────────────────────
// Envoltorio de diálogo de `CobroEncomiendaContenido` (cobro-encomienda.tsx):
// lo usan la lista de taquilla (recepción de encomiendas de la app y "Cobrar"
// del detalle). La nueva encomienda de taquilla usa el mismo contenido como fase
// de página. `CobroEncomiendaForm` se re-exporta aquí porque también lo usa la
// entrega en destino (entrega-modal).

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCiudad } from "@/lib/ciudades";
import type { Encomienda } from "@/lib/types/encomiendas";
import { CobroEncomiendaContenido } from "./cobro-encomienda";

export { CobroEncomiendaForm, type CobroEncomiendaFormProps, type EncomiendaACobrar } from "./cobro-encomienda";

interface PagoModalProps {
  encomienda: Encomienda;
  isOpen: boolean;
  onClose: () => void;
  /** El cobro quedó registrado o aprobado. */
  onSuccess: (encomiendaId: string) => void;
}

export function PagoModal({ encomienda, isOpen, onClose, onSuccess }: PagoModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent tamano="flujo">
        <DialogHeader>
          <DialogTitle>Cobrar encomienda</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{encomienda.tracking_id}</span> · {formatCiudad(encomienda.ciudad_origen)} →{" "}
            {formatCiudad(encomienda.ciudad_destino)}
          </DialogDescription>
        </DialogHeader>
        {/* Montado solo con el diálogo abierto: revisa el estado del cobro cada vez que se abre. */}
        {isOpen && <CobroEncomiendaContenido encomienda={encomienda} onSuccess={onSuccess} onCerrar={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
