import { supabase } from './supabase';
// SDK 54: los métodos clásicos (`getInfoAsync`, `readAsStringAsync`) solo
// funcionan importados de `expo-file-system/legacy`; desde la raíz lanzan.
import * as FileSystem from 'expo-file-system/legacy';
import { AppError } from './errores';

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

/** Sube la imagen a `<userId>/<nombre>.<ext>` del bucket y devuelve la ruta del objeto. */
async function subirImagen(
  localUri: string,
  userId: string,
  opciones: {
    bucket: string;
    maxMb: number;
    upsert: boolean;
    /** Si se indica, otros formatos se rechazan antes de subir. */
    formatos?: string[];
  }
): Promise<string> {
  // fetch().blob() is unreliable on Android and doesn't support HEIC.
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new AppError('No pudimos leer la imagen. Selecciónala de nuevo.');
  }

  // Validate file size to avoid memory pressure and upload timeouts
  if (fileInfo.size && fileInfo.size > opciones.maxMb * 1024 * 1024) {
    throw new AppError(`La imagen es demasiado grande. El tamaño máximo es ${opciones.maxMb} MB.`);
  }

  const cleanUri = localUri.split('?')[0].split('#')[0];
  const rawExt = cleanUri.split('.').pop()?.toLowerCase() ?? '';
  const fileExt = MIME_MAP[rawExt] ? rawExt : 'jpg';
  const contentType = MIME_MAP[fileExt];
  if (opciones.formatos && !opciones.formatos.includes(fileExt)) {
    throw new AppError('Este formato de imagen no se puede enviar. Usa un capture en JPG o PNG.');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  // Supabase storage accepts ArrayBuffer; decode base64 string to Uint8Array
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const ruta = `${userId}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage.from(opciones.bucket).upload(ruta, byteArray, {
    contentType,
    upsert: opciones.upsert,
  });

  if (error) {
    throw error;
  }

  return ruta;
}

/**
 * Sube una imagen local (URI) al bucket privado `fotos-encomiendas`, en la
 * carpeta del usuario, y devuelve la RUTA del objeto (`<userId>/<ts>.<ext>`),
 * no una URL: el bucket es privado y la foto se muestra con
 * `urlFotoEncomienda(ruta)` de `src/utils/fotos.ts` (URL firmada).
 */
export function uploadEvidencePhoto(localUri: string, userId: string): Promise<string> {
  return subirImagen(localUri, userId, { bucket: 'fotos-encomiendas', maxMb: 10, upsert: true });
}

/**
 * Sube el capture de un Pago Móvil al bucket privado `comprobantes-pago`. La
 * ruta se envía con el reporte del pago, y la cooperativa la abre desde el
 * panel. Mismos límites que el bucket: 5 MB, JPG, PNG o WEBP (HEIC no se ve en
 * el navegador).
 */
export function uploadComprobantePago(localUri: string, userId: string): Promise<string> {
  return subirImagen(localUri, userId, {
    bucket: 'comprobantes-pago',
    maxMb: 5,
    upsert: false,
    formatos: ['jpg', 'jpeg', 'png', 'webp'],
  });
}
