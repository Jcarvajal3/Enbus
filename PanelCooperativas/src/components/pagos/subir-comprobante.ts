// ─── Subir el capture de un pago (cliente) ───────────────────────────────────
// Bucket privado `comprobantes-pago`, ruta `<uid>/<uuid>.<ext>`, JPG/PNG/WEBP ≤ 5 MB.
// Las imágenes grandes se reescalan y comprimen en un canvas antes de subir.

import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/errores";

export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const POR_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
/** Por encima de esto se intenta comprimir aunque pese menos de 5 MB. */
const UMBRAL_COMPRIMIR = 1.5 * 1024 * 1024;
const LADO_MAX = 2000;

export type ResultadoSubida = { ok: true; path: string } | { ok: false; error: string };

function tipoDe(file: File): string | null {
  if (TIPOS[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !file.type ? (POR_EXTENSION[ext] ?? null) : null;
}

/** Mensaje si el archivo no sirve como comprobante; null si está bien (pesa de más solo si no se puede comprimir). */
export function validarArchivoComprobante(file: File): string | null {
  if (!tipoDe(file)) return "Este formato no se puede enviar. Usa un capture en JPG, PNG o WEBP.";
  if (file.size === 0) return "No pudimos leer la imagen. Elígela de nuevo.";
  return null;
}

async function comprimir(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

/** Sube el capture y devuelve la ruta del objeto (lo que se manda como `p_comprobante_path`). */
export async function subirComprobante(file: File): Promise<ResultadoSubida> {
  const invalido = validarArchivoComprobante(file);
  if (invalido) return { ok: false, error: invalido };
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return { ok: false, error: "Tu sesión venció. Inicia sesión de nuevo." };

    let cuerpo: Blob = file;
    let tipo = tipoDe(file) as string;
    if (file.size > UMBRAL_COMPRIMIR) {
      const comprimido = await comprimir(file);
      if (comprimido && comprimido.size < file.size) {
        cuerpo = comprimido;
        tipo = "image/jpeg";
      }
    }
    if (cuerpo.size > COMPROBANTE_MAX_BYTES) {
      return { ok: false, error: "La imagen es demasiado grande. El tamaño máximo es 5 MB." };
    }

    const path = `${uid}/${crypto.randomUUID()}.${TIPOS[tipo]}`;
    const { error } = await supabase.storage.from("comprobantes-pago").upload(path, cuerpo, {
      contentType: tipo,
      upsert: false,
    });
    if (error) return { ok: false, error: humanizeError(error, "subir el comprobante") };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: humanizeError(err, "subir el comprobante") };
  }
}
