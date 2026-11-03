/**
 * Enlaces de autenticación (#23, #24).
 *
 * Con `flowType: 'pkce'` todos los enlaces vuelven a la misma ruta,
 * `enbus://auth/callback?tipo=…&code=…` (en Expo Go, `exp://…/--/auth/callback`):
 *   - Google: `signInWithOAuth` + `WebBrowser.openAuthSessionAsync` (login).
 *   - Confirmar el correo al registrarse (`signUp` / `resend`).
 *   - Recuperar la contraseña (`resetPasswordForEmail`).
 * `completarSesionDesdeUrl` canjea el código por la sesión. Lo usan la
 * pantalla de login (Google) y `app/auth/callback.tsx` (enlaces de correo).
 */

import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { humanizeError } from './errores';

export type TipoEnlaceAuth = 'google' | 'registro' | 'recuperar';

const TIPOS: readonly TipoEnlaceAuth[] = ['google', 'registro', 'recuperar'];

/** URL a la que vuelve el enlace (se añade en Supabase › Auth › Redirect URLs). */
export function redirectAuth(tipo: TipoEnlaceAuth): string {
  return Linking.createURL('auth/callback', { queryParams: { tipo } });
}

export type ResultadoEnlaceAuth =
  | { ok: true; tipo: TipoEnlaceAuth | null }
  /** `cancelado`: la persona rechazó el acceso en Google (no es un error que mostrar). */
  | { ok: false; error: string; cancelado?: boolean };

/** Lee `?a=b` y `#c=d` de una URL con esquema propio (sin depender de `URL`). */
function leerParametros(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [antesHash, hash = ''] = url.split('#');
  const query = antesHash.includes('?') ? antesHash.slice(antesHash.indexOf('?') + 1) : '';
  for (const parte of [query, hash]) {
    for (const par of parte.split('&')) {
      if (!par) continue;
      const i = par.indexOf('=');
      const clave = i === -1 ? par : par.slice(0, i);
      const valor = i === -1 ? '' : par.slice(i + 1);
      try {
        params[decodeURIComponent(clave)] = decodeURIComponent(valor.replace(/\+/g, ' '));
      } catch {
        params[clave] = valor;
      }
    }
  }
  return params;
}

function tipoDe(valor: string | undefined): TipoEnlaceAuth | null {
  return TIPOS.includes(valor as TipoEnlaceAuth) ? (valor as TipoEnlaceAuth) : null;
}

/**
 * En Android el mismo enlace puede llegar dos veces (al navegador de
 * `openAuthSessionAsync` y al router, que abre `auth/callback`). Un código PKCE
 * solo se canjea una vez: la segunda llamada reutiliza el resultado.
 */
const canjes = new Map<string, Promise<ResultadoEnlaceAuth>>();

async function canjearCodigo(code: string, tipo: TipoEnlaceAuth | null): Promise<ResultadoEnlaceAuth> {
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true, tipo };
    // Si el código ya se canjeó (en la otra vía) y hay sesión, todo bien.
    const { data } = await supabase.auth.getSession();
    if (data.session) return { ok: true, tipo };
    return { ok: false, error: humanizeError(error, 'auth') };
  } catch (err) {
    return { ok: false, error: humanizeError(err, 'auth') };
  }
}

/**
 * Completa la sesión a partir de la URL con la que volvió el enlace:
 *   - `?code=` → `exchangeCodeForSession` (PKCE).
 *   - `#access_token=…&refresh_token=…` → `setSession` (enlaces antiguos).
 *   - `?error_description=` → error en español.
 * Nunca lanza.
 */
export async function completarSesionDesdeUrl(url: string): Promise<ResultadoEnlaceAuth> {
  const p = leerParametros(url);
  const tipo = tipoDe(p.tipo);

  try {
    if (p.error || p.error_description || p.error_code) {
      if (p.error === 'access_denied' && !p.error_code?.startsWith('otp')) {
        return {
          ok: false,
          cancelado: true,
          error: 'No pudimos completar el acceso. Intenta de nuevo o usa tu correo y contraseña.',
        };
      }
      return {
        ok: false,
        error: humanizeError({ code: p.error_code ?? p.error, message: p.error_description ?? '' }, 'auth'),
      };
    }

    if (p.code) {
      let canje = canjes.get(p.code);
      if (!canje) {
        const code = p.code;
        canje = canjearCodigo(code, tipo).then((r) => {
          // Un fallo (p. ej. sin conexión) se puede reintentar con el mismo enlace.
          if (!r.ok) canjes.delete(code);
          return r;
        });
        canjes.set(code, canje);
      }
      return await canje;
    }

    if (p.access_token && p.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });
      if (error) return { ok: false, error: humanizeError(error, 'auth') };
      return { ok: true, tipo: tipo ?? (p.type === 'recovery' ? 'recuperar' : null) };
    }

    return { ok: false, error: humanizeError(null, 'auth') };
  } catch (err) {
    return { ok: false, error: humanizeError(err, 'auth') };
  }
}
