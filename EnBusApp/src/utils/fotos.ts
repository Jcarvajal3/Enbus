/**
 * Fotos de encomiendas (bucket privado `fotos-encomiendas`).
 *
 * En la base se guarda la RUTA del objeto (`<carpeta>/<archivo>`), no una URL:
 * el bucket es privado y una URL pública nunca carga. Para mostrarla se pide
 * una URL firmada de 1 hora. Las filas antiguas guardaron la URL pública
 * completa; de ella se extrae la ruta (lo que va tras `/fotos-encomiendas/`).
 */

import { supabase } from './supabase';

const BUCKET = 'fotos-encomiendas';
const MARCA_BUCKET = `/${BUCKET}/`;
/** Vigencia de la URL firmada: suficiente para ver el detalle sin volver a pedirla. */
const SEGUNDOS_URL = 60 * 60;

/** Ruta del objeto a partir de una ruta o de una URL antigua. `null` si no es del bucket. */
export function rutaFotoEncomienda(rutaOUrl: string | null | undefined): string | null {
  const valor = (rutaOUrl ?? '').trim();
  if (!valor) return null;

  if (/^https?:\/\//i.test(valor)) {
    const i = valor.indexOf(MARCA_BUCKET);
    if (i === -1) return null;
    const ruta = valor.slice(i + MARCA_BUCKET.length).split(/[?#]/)[0];
    try {
      return decodeURIComponent(ruta) || null;
    } catch {
      return ruta || null;
    }
  }

  return valor.replace(/^\/+/, '') || null;
}

/**
 * URL firmada (1 h) para mostrar la foto, o `null` si no hay foto, no es del
 * bucket o no se pudo firmar (sin conexión, objeto borrado, sin permiso).
 * Nunca lanza: la pantalla simplemente no muestra la imagen.
 */
export async function urlFotoEncomienda(rutaOUrl: string | null | undefined): Promise<string | null> {
  const ruta = rutaFotoEncomienda(rutaOUrl);
  if (!ruta) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_URL);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
