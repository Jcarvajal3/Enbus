// ─── Foto del paquete (cliente) ──────────────────────────────────────────────
// Bucket privado `fotos-encomiendas`, ruta `<uid>/<uuid>.<ext>` (la política de storage exige
// que la carpeta sea el id de quien envía). JPG/PNG/WEBP, máximo 10 MB: las imágenes grandes
// se reescalan y comprimen en un canvas antes de subir.

import { humanizeError } from "@/lib/errores";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { createClient } from "@/lib/supabase/client";

export const FOTO_PAQUETE_MAX_BYTES = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const POR_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
/** Por encima de esto se intenta comprimir aunque quepa en el límite. */
const UMBRAL_COMPRIMIR = 2 * 1024 * 1024;
const LADO_MAX = 1600;

export type ResultadoSubidaFoto = { ok: true; path: string } | { ok: false; error: string };

function tipoDe(file: File): string | null {
  if (TIPOS[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !file.type ? (POR_EXTENSION[ext] ?? null) : null;
}

/** Mensaje si el archivo no sirve como foto del paquete; null si está bien. */
export function validarFotoPaquete(file: File): string | null {
  if (!tipoDe(file)) return "Este formato no se puede enviar. Usa una foto en JPG, PNG o WEBP.";
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
    // JPEG no tiene transparencia: sin fondo, los PNG/WebP con alfa quedarían sobre negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

/** Sube la foto y devuelve la ruta del objeto (lo que se guarda en `foto_cliente_path`). */
export async function subirFotoPaquete(file: File, uid: string): Promise<ResultadoSubidaFoto> {
  const invalido = validarFotoPaquete(file);
  if (invalido) return { ok: false, error: invalido };
  try {
    const supabase = createClient();
    let cuerpo: Blob = file;
    let tipo = tipoDe(file) as string;
    if (file.size > UMBRAL_COMPRIMIR) {
      const comprimido = await comprimir(file);
      if (comprimido && comprimido.size < file.size) {
        cuerpo = comprimido;
        tipo = "image/jpeg";
      }
    }
    if (cuerpo.size > FOTO_PAQUETE_MAX_BYTES) {
      return { ok: false, error: "La imagen es demasiado grande. El tamaño máximo es 10 MB." };
    }
    const path = `${uid}/${crypto.randomUUID()}.${TIPOS[tipo]}`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, cuerpo, { contentType: tipo, upsert: false });
    if (error) return { ok: false, error: humanizeError(error, "subir la foto") };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: humanizeError(err, "subir la foto") };
  }
}
