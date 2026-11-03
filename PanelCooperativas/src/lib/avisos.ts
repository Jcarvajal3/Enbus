import { toast } from "sonner";

// ─── Avisos breves (SY-08, §2.3) ────────────────────────────────────────────
// Un solo modo de avisar en el panel y el admin. El error persiste hasta que se
// cierra (en una taquilla con prisa no se pierde); éxito e info, 3 s. Dentro de
// un diálogo, el error va en <AvisoError>, no aquí.

/** Error persistente, con botón de cierre. */
export function avisarError(mensaje: string): void {
  // Único toast.error permitido (eslint.config.mjs lo excluye del barrido).
  toast.error(mensaje, { duration: Infinity, closeButton: true });
}

/** Confirmación de una acción hecha (3 s). */
export function avisarExito(mensaje: string): void {
  toast.success(mensaje, { duration: 3000 });
}

/** Información sin tono de éxito ni de error (3 s). */
export function avisarInfo(mensaje: string): void {
  toast.info(mensaje, { duration: 3000 });
}
