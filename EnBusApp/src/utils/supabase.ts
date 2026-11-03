import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // #24: todos los enlaces (Google, confirmar correo, recuperar contraseña)
    // vuelven a `auth/callback` con `?code=` y se canjean ahí
    // (`completarSesionDesdeUrl` en `authLinks.ts`).
    flowType: 'pkce',
  },
});
