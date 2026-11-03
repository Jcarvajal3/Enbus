import { supabase } from './supabase';
// SDK 54: los métodos clásicos (`getInfoAsync`, `readAsStringAsync`) solo
// funcionan importados de `expo-file-system/legacy`; desde la raíz lanzan.
import * as FileSystem from 'expo-file-system/legacy';
import { AppError } from './errores';
import { urlFotoEncomienda } from './fotos';

const BUCKET = 'fotos-encomiendas';

/**
 * Sube una imagen local (URI) al bucket privado `fotos-encomiendas`, en la
 * carpeta del usuario, y devuelve la RUTA del objeto (`<userId>/<ts>.<ext>`),
 * no una URL: el bucket es privado y la foto se muestra con
 * `urlFotoEncomienda(ruta)` (URL firmada).
 */
export async function uploadEvidencePhoto(localUri: string, userId: string): Promise<string> {
  // fetch().blob() is unreliable on Android and doesn't support HEIC.
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new AppError('No pudimos leer la imagen. Selecciónala de nuevo.');
  }

  // Validate file size (10MB max to avoid memory pressure and upload timeouts)
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  if (fileInfo.size && fileInfo.size > MAX_SIZE_BYTES) {
    throw new AppError('La imagen es demasiado grande. El tamaño máximo es 10 MB.');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  const cleanUri = localUri.split('?')[0].split('#')[0];
  const rawExt = cleanUri.split('.').pop()?.toLowerCase() ?? '';

  // Map extension to MIME type (covers HEIC common on iOS, WEBP from Android)
  const MIME_MAP: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    heic: 'image/heic',
    heif: 'image/heif',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  const fileExt = MIME_MAP[rawExt] ? rawExt : 'jpg';
  const contentType = MIME_MAP[fileExt];

  // Supabase storage accepts ArrayBuffer; decode base64 string to Uint8Array
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const ruta = `${userId}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, byteArray, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }

  return ruta;
}

/**
 * @deprecated Usa `urlFotoEncomienda` de `src/utils/fotos.ts` (devuelve `null`
 * si no se puede mostrar). Se mantiene para las pantallas que aún la usan:
 * devuelve la URL firmada (1 h), la URL antigua si no es de este bucket, o `''`.
 */
export async function getSignedPhotoUrl(urlOrPath: string): Promise<string> {
  if (!urlOrPath) return '';
  const firmada = await urlFotoEncomienda(urlOrPath);
  if (firmada) return firmada;
  return /^https?:\/\//i.test(urlOrPath) && !urlOrPath.includes(`/${BUCKET}/`) ? urlOrPath : '';
}
