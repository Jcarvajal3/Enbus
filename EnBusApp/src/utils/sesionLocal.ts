/**
 * Lo que este teléfono guarda de la cuenta que tiene la sesión abierta y hay que
 * soltar al cerrarla: el token de push guardado en `profiles` y la caché de
 * pantallas (`cache:*` en AsyncStorage, con boletos, envíos y datos personales).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

let tokenPushRegistrado: string | null = null;

/** `usePushNotifications` lo anota al guardar el token de este teléfono. */
export function anotarTokenPush(token: string | null): void {
  tokenPushRegistrado = token;
}

/** Espera `promesa` como mucho `ms`; nunca rechaza. */
async function conTope(promesa: PromiseLike<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      Promise.resolve(promesa).catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Quita el token de push de este teléfono del perfil antes de cerrar la sesión.
 * Sin esto, las push de la cuenta (con datos del boleto o del envío) seguían
 * llegando a este teléfono aunque ya la usara otra persona. Si se conoce el token
 * de este teléfono, solo lo borra si sigue siendo ese (otro dispositivo pudo
 * registrarse después). El token se vuelve a registrar al iniciar sesión
 * (`usePushNotifications`, efecto por `userId`).
 * Mejor esfuerzo, con tope de 3 s: sin red no bloquea el cierre de sesión.
 */
export async function desvincularPushDeEsteTelefono(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const token = tokenPushRegistrado;
  // Sin token anotado (el registro de esta sesión no terminó o falló) no se sabe
  // si el guardado es de este teléfono: se borra igual, por privacidad. El
  // teléfono que siga con la sesión abierta lo vuelve a registrar al abrir la app.
  const consulta = supabase.from('profiles').update({ expo_push_token: null }).eq('id', userId);
  await conTope(token ? consulta.eq('expo_push_token', token) : consulta, 3000);
  tokenPushRegistrado = null;
}

/** Borra la caché de pantallas (`cache:*`). Nunca lanza. */
export async function limpiarCacheLocal(): Promise<void> {
  try {
    const claves = await AsyncStorage.getAllKeys();
    const cache = claves.filter((k) => k.startsWith('cache:'));
    if (cache.length) await AsyncStorage.multiRemove(cache);
  } catch {
    // La caché se reemplaza con la próxima cuenta que entre en este teléfono.
  }
}
