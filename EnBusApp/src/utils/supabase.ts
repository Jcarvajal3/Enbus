import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, SupportedStorage } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Variables `EXPO_PUBLIC_*` que faltan en este build. Antes se lanzaba un error
 * al importar este módulo: en un build de producción eso cierra la app al abrirla
 * sin ningún mensaje. Ahora `app/_layout.tsx` muestra una pantalla que lo explica
 * y el detalle queda en el log nativo.
 */
export const configuracionFaltante: string[] = [
  ...(supabaseUrl ? [] : ['EXPO_PUBLIC_SUPABASE_URL']),
  ...(supabaseAnonKey ? [] : ['EXPO_PUBLIC_SUPABASE_ANON_KEY']),
];

if (configuracionFaltante.length > 0) {
  console.error(
    `[EnBus] Faltan variables de entorno: ${configuracionFaltante.join(', ')}. ` +
      'Defínelas en EnBusApp/.env (desarrollo) o en el perfil de EAS (builds) y vuelve a compilar.'
  );
}

// ─── Sesión en SecureStore, en trozos ────────────────────────────────────────
// SecureStore admite valores de hasta 2048 bytes (más allá avisa y, según el SDK,
// puede fallar). Una sesión de Supabase con los datos de Google suele pasar de
// 3 KB: se guarda en trozos `<clave>.0`, `<clave>.1`… y en `<clave>` solo queda el
// marcador con cuántos son. Los valores cortos (p. ej. el `code_verifier` de PKCE)
// se guardan tal cual.

/** Caracteres por trozo: 600 × 3 bytes (UTF-8 del plano básico) = 1800 < 2048. */
const TROZO = 600;
const MARCA_TROZOS = '__enbus_trozos__:';

/** Parte `valor` sin cortar un par sustituto (emoji) por la mitad. */
function partir(valor: string): string[] {
  const partes: string[] = [];
  let i = 0;
  while (i < valor.length) {
    let fin = Math.min(i + TROZO, valor.length);
    const ultimo = valor.charCodeAt(fin - 1);
    if (fin < valor.length && ultimo >= 0xd800 && ultimo <= 0xdbff) fin -= 1;
    partes.push(valor.slice(i, fin));
    i = fin;
  }
  return partes;
}

const claveTrozo = (key: string, i: number) => `${key}.${i}`;

function cuantosTrozos(guardado: string | null): number {
  if (!guardado?.startsWith(MARCA_TROZOS)) return 0;
  const n = Number(guardado.slice(MARCA_TROZOS.length));
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : 0;
}

async function borrarTrozos(key: string, desde: number, hasta: number): Promise<void> {
  for (let i = desde; i < hasta; i++) {
    try {
      await SecureStore.deleteItemAsync(claveTrozo(key, i));
    } catch {
      // Un trozo huérfano no se vuelve a leer: el marcador dice cuántos valen.
    }
  }
}

const SecureStorageAdapter: SupportedStorage = {
  getItem: async (key: string) => {
    try {
      const guardado = await SecureStore.getItemAsync(key);
      const n = cuantosTrozos(guardado);
      if (n === 0) return guardado;
      const partes: string[] = [];
      for (let i = 0; i < n; i++) {
        const parte = await SecureStore.getItemAsync(claveTrozo(key, i));
        // Un trozo perdido invalida la sesión: mejor pedir el login que leer basura.
        if (parte == null) return null;
        partes.push(parte);
      }
      return partes.join('');
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      const previos = cuantosTrozos(await SecureStore.getItemAsync(key));
      if (value.length <= TROZO) {
        await SecureStore.setItemAsync(key, value);
        if (previos > 0) await borrarTrozos(key, 0, previos);
        return;
      }
      const partes = partir(value);
      // Primero los trozos y al final el marcador: si algo falla a medias, el
      // marcador anterior sigue apuntando a una sesión entera o a ninguna.
      for (let i = 0; i < partes.length; i++) {
        await SecureStore.setItemAsync(claveTrozo(key, i), partes[i]);
      }
      await SecureStore.setItemAsync(key, `${MARCA_TROZOS}${partes.length}`);
      if (previos > partes.length) await borrarTrozos(key, partes.length, previos);
    } catch {
      // Sin almacenamiento seguro la sesión vive solo en memoria: se pedirá
      // iniciar sesión de nuevo al reabrir la app.
    }
  },
  removeItem: async (key: string) => {
    try {
      const previos = cuantosTrozos(await SecureStore.getItemAsync(key));
      await SecureStore.deleteItemAsync(key);
      if (previos > 0) await borrarTrozos(key, 0, previos);
    } catch {
      // Nada que borrar o almacenamiento no disponible: no afecta al usuario.
    }
  },
};

// En web (vista previa y pruebas en navegador) SecureStore no existe: la sesión se guarda en
// localStorage para que sobreviva a una recarga. En Android e iOS se usa SecureStore.
const WebStorageAdapter: SupportedStorage = {
  getItem: async (key: string) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Navegador sin almacenamiento: la sesión vive solo en memoria.
    }
  },
  removeItem: async (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nada que borrar.
    }
  },
};

export const supabase = createClient(
  // Sin configuración se crea igual un cliente (createClient lanza con una URL
  // vacía): la app no llega a usarlo porque `_layout` muestra el aviso.
  supabaseUrl || 'https://configuracion-faltante.invalid',
  supabaseAnonKey || 'configuracion-faltante',
  {
    auth: {
      storage: Platform.OS === 'web' ? WebStorageAdapter : SecureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // #24: todos los enlaces (Google, confirmar correo, recuperar contraseña)
      // vuelven a `auth/callback` con `?code=` y se canjean ahí
      // (`completarSesionDesdeUrl` en `authLinks.ts`).
      flowType: 'pkce',
    },
  }
);
