// ─── Fotos de encomiendas (bucket privado `fotos-encomiendas`) ───────────────
// Desde la fase 3 se guarda la RUTA del objeto ("<encomiendaId>/<ts>.jpg" o
// "<userId>/<ts>.jpg") y se muestra con una URL firmada. Las filas antiguas
// tienen la URL pública completa: se extrae la ruta de lo que va tras
// "/fotos-encomiendas/". Si no se reconoce, no se muestra (nunca rompe).

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_FOTOS = "fotos-encomiendas";

/** Ruta del objeto dentro del bucket, a partir de una ruta o de una URL antigua. null si no hay. */
export function rutaDeFoto(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const marca = `/${BUCKET_FOTOS}/`;
    const i = v.indexOf(marca);
    if (i < 0) return null;
    const ruta = v.slice(i + marca.length).split(/[?#]/)[0];
    try {
      return decodeURIComponent(ruta) || null;
    } catch {
      return ruta || null;
    }
  }
  // Ruta relativa; tolera que venga con el nombre del bucket delante.
  const ruta = v.replace(/^\/+/, "").replace(new RegExp(`^${BUCKET_FOTOS}/`), "");
  return ruta || null;
}

/**
 * URL firmada para mostrar la foto (por defecto, válida 1 hora). null si no hay
 * foto, no se reconoce la ruta o no se pudo firmar (sin permiso o sin red).
 */
export async function urlFirmadaFoto(
  // Solo se usa `storage`: acepta el cliente del navegador, del servidor o el admin.
  supabase: Pick<SupabaseClient, "storage">,
  valor: string | null | undefined,
  segundos = 3600
): Promise<string | null> {
  const ruta = rutaDeFoto(valor);
  if (!ruta) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(ruta, segundos);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Ruta para una foto nueva tomada en la taquilla: "<encomiendaId>/<timestamp>.jpg". */
export function rutaNuevaFoto(encomiendaId: string, extension = "jpg"): string {
  return `${encomiendaId}/${Date.now()}.${extension.replace(/^\./, "")}`;
}
