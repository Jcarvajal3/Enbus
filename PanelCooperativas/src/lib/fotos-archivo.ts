// ─── Procesamiento y subida de fotos de encomiendas (cliente) ───────────────
// Valida archivos de imagen, los redimensiona/comprime en JPEG manteniendo su
// proporción exacta (nunca recorta) y los sube de forma idempotente al bucket
// privado `fotos-encomiendas` antes de guardar la ruta en la encomienda.

import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarFotoEncomienda, type ResultadoTaquilla } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { humanizeError, isNetworkError } from "@/lib/errores";
import { BUCKET_FOTOS, rutaNuevaFoto } from "@/lib/fotos";

export const MAX_FOTO_BYTES = 10 * 1024 * 1024;
export const MAX_FOTO_ORIGEN_BYTES = 30 * 1024 * 1024;
export const LADO_MAXIMO_FOTO = 1600;
export const CALIDAD_JPEG_FOTO = 0.8;

const MSG_ERROR_SUBIDA = "No pudimos subir la foto. Intenta de nuevo o súbela después desde el detalle.";
const EXTENSION_IMAGEN_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;
const TIPOS_PASSTHROUGH = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ResultadoPrepararFoto = { ok: true; blob: Blob } | { ok: false; error: string };
export type CacheSubidaFoto = { encomiendaId: string; foto: Blob; ruta: string };
export type ResultadoSubidaFoto = { ok: true; ruta: string } | { ok: false; error: string };

/** Extensión de archivo para guardar la foto en el bucket según su MIME. */
export function extensionDeFoto(tipo: string): string {
  const normalizado = tipo.toLowerCase();
  if (normalizado === "image/png") return "png";
  if (normalizado === "image/webp") return "webp";
  return "jpg";
}

/**
 * Valida que el archivo sea una imagen soportada (excluye SVG para evitar XSS
 * y acepta archivos sin MIME si su extensión corresponde a una imagen común).
 */
export function esArchivoImagenValido(archivo: File): boolean {
  const tipo = (archivo.type ?? "").trim().toLowerCase();
  if (tipo === "image/svg+xml" || tipo.startsWith("image/svg")) return false;
  if (tipo.startsWith("image/")) return true;
  if (tipo === "") return EXTENSION_IMAGEN_RE.test(archivo.name ?? "");
  return false;
}

async function canvasAJpeg(fuente: CanvasImageSource, ancho: number, alto: number): Promise<Blob | null> {
  if (ancho <= 0 || alto <= 0 || typeof document === "undefined") return null;
  const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(ancho * escala));
  canvas.height = Math.max(1, Math.round(alto * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", CALIDAD_JPEG_FOTO);
  });
}

async function decodificarConBitmap(archivo: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(archivo);
    }
    return await canvasAJpeg(bitmap, bitmap.width, bitmap.height);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

async function decodificarConImg(archivo: File): Promise<Blob | null> {
  if (typeof Image === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elemento = new Image();
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      elemento.src = url;
    });
    const ancho = img.naturalWidth || img.width;
    const alto = img.naturalHeight || img.height;
    return await canvasAJpeg(img, ancho, alto);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Valida y procesa una imagen seleccionada por el usuario: la reduce a
 * `LADO_MAXIMO_FOTO` por el lado mayor manteniendo su proporción (sin recortar)
 * y la comprime en JPEG (`CALIDAD_JPEG_FOTO`).
 */
export async function prepararImagenArchivo(archivo: File): Promise<ResultadoPrepararFoto> {
  if (!esArchivoImagenValido(archivo)) {
    return { ok: false, error: "Elige una imagen válida (JPG, PNG o WebP)." };
  }
  if (archivo.size === 0) {
    return { ok: false, error: "El archivo seleccionado está vacío. Elige otra imagen." };
  }
  if (archivo.size > MAX_FOTO_ORIGEN_BYTES) {
    return { ok: false, error: "La imagen es demasiado grande (máximo 30 MB). Elige una más liviana." };
  }

  let procesado = await decodificarConBitmap(archivo);
  if (!procesado || procesado.size === 0) {
    procesado = await decodificarConImg(archivo);
  }

  if (!procesado || procesado.size === 0) {
    const tipo = (archivo.type ?? "").trim().toLowerCase();
    if (TIPOS_PASSTHROUGH.has(tipo) && archivo.size <= MAX_FOTO_BYTES) {
      return { ok: true, blob: archivo };
    }
    return { ok: false, error: "No pudimos procesar esta imagen. Usa un archivo JPG, PNG o WebP." };
  }

  if (procesado.size > MAX_FOTO_BYTES) {
    return { ok: false, error: "La foto pesa más de 10 MB. Elige una imagen más liviana." };
  }

  return { ok: true, blob: procesado };
}

/**
 * Sube una foto al bucket privado y registra su ruta en la encomienda.
 * Reutiliza `cacheRef` si coincide `(encomiendaId, foto)` para evitar subidas
 * duplicadas cuando falla el guardado en el servidor y el usuario reintenta.
 */
export async function subirYGuardarFotoEncomienda(params: {
  supabase: Pick<SupabaseClient, "storage">;
  encomiendaId: string;
  foto: Blob;
  cacheRef?: { current: CacheSubidaFoto | null };
  guardarEnServidor?: (encomiendaId: string, payload: { ruta: string }) => Promise<ResultadoTaquilla<{ ok: true }>>;
}): Promise<ResultadoSubidaFoto> {
  const { supabase, encomiendaId, foto, cacheRef, guardarEnServidor } = params;
  try {
    let ruta =
      cacheRef?.current?.encomiendaId === encomiendaId && cacheRef.current.foto === foto
        ? cacheRef.current.ruta
        : null;

    if (!ruta) {
      const tipo = foto.type || "image/jpeg";
      const nueva = rutaNuevaFoto(encomiendaId, extensionDeFoto(tipo));
      const { error: errorSubida } = await supabase.storage.from(BUCKET_FOTOS).upload(nueva, foto, { contentType: tipo });
      if (errorSubida) throw errorSubida;
      if (cacheRef) {
        cacheRef.current = { encomiendaId, foto, ruta: nueva };
      }
      ruta = nueva;
    }

    const res = await (guardarEnServidor ?? guardarFotoEncomienda)(encomiendaId, { ruta });
    if (!res.success) {
      return { ok: false, error: res.error };
    }
    return { ok: true, ruta };
  } catch (err) {
    return { ok: false, error: isNetworkError(err) ? humanizeError(err) : MSG_ERROR_SUBIDA };
  }
}
