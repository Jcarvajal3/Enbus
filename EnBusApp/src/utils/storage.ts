import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';

/**
 * Sube una imagen local (URI) al bucket de Supabase storage 'fotos-encomiendas'
 * y retorna la URL pública.
 */
export async function uploadEvidencePhoto(localUri: string, userId: string): Promise<string> {
  // Use expo-file-system for reliable local file reading on React Native.
  // fetch().blob() is unreliable on Android and doesn't support HEIC.
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new Error('El archivo de imagen no existe en la ruta indicada.');
  }

  // Validate file size (10MB max to avoid memory pressure and upload timeouts)
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  if (fileInfo.size && fileInfo.size > MAX_SIZE_BYTES) {
    throw new Error('La imagen es demasiado grande. El tamaño máximo es 10 MB.');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  const cleanUri = localUri.split('?')[0].split('#')[0];
  const rawExt = cleanUri.split('.').pop()?.toLowerCase() || 'jpg';
  const fileExt = rawExt;

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
  const contentType = MIME_MAP[fileExt] ?? 'image/jpeg';

  // Supabase storage accepts ArrayBuffer; decode base64 string to Uint8Array
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('fotos-encomiendas')
    .upload(fileName, byteArray, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  // Return the public URL for the uploaded file
  const { data: urlData } = supabase.storage
    .from('fotos-encomiendas')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * Si el bucket es privado y la URL de la evidencia da error 400/403,
 * generamos una URL firmada válida por 24 horas a partir del path de la URL.
 */
export async function getSignedPhotoUrl(urlOrPath: string): Promise<string> {
  if (!urlOrPath) return '';
  
  try {
    let path = urlOrPath;
    if (urlOrPath.startsWith('http')) {
      const token = 'fotos-encomiendas/';
      const index = urlOrPath.indexOf(token);
      if (index !== -1) {
        path = urlOrPath.substring(index + token.length);
        // Quitar posibles query params
        path = path.split('?')[0];
      } else {
        return urlOrPath; // No pertenece a este bucket, retornar tal cual
      }
    }

    const { data, error } = await supabase.storage
      .from('fotos-encomiendas')
      .createSignedUrl(path, 86400); // 24 horas

    if (error) {
      console.warn('Error al generar URL firmada para la evidencia:', error.message);
      return urlOrPath;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error en getSignedPhotoUrl:', err);
    return urlOrPath;
  }
}
