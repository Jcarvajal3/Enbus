import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, SupportedStorage } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables (URL or ANON_KEY) are missing.');
}

const SecureStorageAdapter: SupportedStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Sin almacenamiento seguro la sesión vive solo en memoria: se pedirá
      // iniciar sesión de nuevo al reabrir la app.
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
});
