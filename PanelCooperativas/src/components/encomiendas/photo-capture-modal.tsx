"use client";

// ─── Foto del paquete en un diálogo (P-35, PC-30) ───────────────────────────
// Envoltorio de diálogo de `FotoPaquete`: lo usan la recepción de encomiendas
// creadas en la app y "Agregar foto" del detalle. La nueva encomienda de
// taquilla usa el mismo contenido como fase de página. En escritorio permite
// elegir o arrastrar una imagen; en móvil permite usar cámara o galería. Se
// puede cerrar (la encomienda queda "Falta foto"), salvo mientras procesa o
// sube la foto.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { descripcionFoto, FotoPaquete, tituloFoto, type ModoFoto } from "./foto-paquete";

interface PhotoCaptureModalProps {
  encomiendaId: string;
  /** Código de seguimiento, para el título. */
  trackingId?: string;
  isOpen: boolean;
  /** Se cerró sin foto ni motivo: la encomienda queda "Falta foto". */
  onClose: () => void;
  /** Se guardó la foto o el motivo para omitirla. */
  onListo: (resultado: "foto" | "omitida") => void;
  /** Texto del paso siguiente, p. ej. "Después: cobrar el envío". */
  siguiente?: string;
}

export function PhotoCaptureModal({ encomiendaId, trackingId, isOpen, onClose, onListo, siguiente }: PhotoCaptureModalProps) {
  const [modo, setModo] = useState<ModoFoto>("seleccion");
  const [ocupado, setOcupado] = useState(false);

  const cerrar = () => {
    if (ocupado) return;
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tituloFoto(modo)}</DialogTitle>
          <DialogDescription>{descripcionFoto(modo, trackingId)}</DialogDescription>
        </DialogHeader>
        {/* Montado solo con el diálogo abierto: reinicia la selección y libera la vista previa al cerrar. */}
        {isOpen && (
          <FotoPaquete
            encomiendaId={encomiendaId}
            siguiente={siguiente}
            onListo={onListo}
            onModo={setModo}
            onOcupado={setOcupado}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
