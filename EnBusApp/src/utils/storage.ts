import { supabase } from './supabase';

/**
 * Sube una imagen local (URI) al bucket de Supabase storage 'fotos-encomiendas'
 * y retorna la URL pública.
 */
export async function uploadEvidencePhoto(localUri: string, userId: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const cleanUri = localUri.split('?')[0].split('#')[0];
  const fileExt = cleanUri.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('fotos-encomiendas')
    .upload(fileName, blob, {
      contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  // Obtenemos la URL pública o la guardamos
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
