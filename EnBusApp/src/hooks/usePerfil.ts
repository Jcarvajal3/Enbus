/**
 * usePerfil – el perfil del usuario y si tiene lo necesario para comprar (#24).
 *
 * Un perfil creado con Google llega sin cédula ni teléfono (la base guarda el
 * marcador `PENDIENTE-<id>`). Antes de apartar asientos o registrar un envío,
 * la pantalla mira `completo` y, si falta algo, abre `CompletarPerfilSheet`.
 *
 *   const { completo, faltan, guardar } = usePerfil();
 *
 * `perfil` ya viene limpio: los marcadores `PENDIENTE-…` se ven como vacíos.
 * Trae también las preferencias de aviso (`notif_*`; `null` = sin elegir, se
 * tratan como activadas) y `guardarNotificaciones` para cambiarlas (#50).
 * Todas las instancias del hook se actualizan cuando una guarda.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/src/contexts/AuthContext';
import { supabase } from '@/src/utils/supabase';
import { AppError, humanizeError } from '@/src/utils/errores';
import {
  MENSAJE_CEDULA,
  MENSAJE_TELEFONO,
  cedulaParaGuardar,
  cedulaValida,
  nombreValido,
  normalizarCedula,
  normalizarTelefono,
  sanitizeText,
  telefonoParaGuardar,
  telefonoValido,
} from '@/src/utils/validation';
import type { PerfilUsuario } from '@/src/types';

export type CampoPerfil = 'nombre' | 'cedula' | 'telefono';

export interface DatosPerfil {
  nombre_completo: string;
  cedula_rif: string;
  telefono: string;
}

export interface UsePerfil {
  perfil: PerfilUsuario | null;
  completo: boolean;
  faltan: CampoPerfil[];
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  /**
   * Valida, normaliza y guarda nombre, cédula y teléfono. Lanza un `AppError`
   * con el texto para el usuario (cédula o teléfono inválidos o ya usados).
   * Devuelve el perfil guardado (quien solo espera `Promise<void>` lo ignora).
   */
  guardar: (d: DatosPerfil) => Promise<PerfilUsuario>;
  /**
   * Guarda una o varias preferencias de aviso (`notif_*`, #50). Lanza un
   * `AppError` con el texto para el usuario si no se pudo; la pantalla vuelve
   * el interruptor a como estaba.
   */
  guardarNotificaciones: (cambios: PreferenciasNotificacion) => Promise<PerfilUsuario>;
}

/** Columnas `notif_*` de `profiles` que el usuario edita en Perfil › Notificaciones. */
export type PreferenciaNotificacion = 'notif_boletos' | 'notif_encomiendas' | 'notif_recordatorios';
export type PreferenciasNotificacion = Partial<Record<PreferenciaNotificacion, boolean>>;

const COLUMNAS =
  'id, nombre_completo, cedula_rif, telefono, notif_boletos, notif_encomiendas, notif_recordatorios, created_at';

export const MENSAJE_CEDULA_USADA =
  'Esa cédula ya está registrada en otra cuenta. Si es tuya, entra con esa cuenta o escríbenos por WhatsApp.';
export const MENSAJE_TELEFONO_USADO =
  'Ese teléfono ya está registrado en otra cuenta. Si es tuyo, entra con esa cuenta o escríbenos por WhatsApp.';

/** Quita los marcadores `PENDIENTE-…` del alta con Google. */
function limpiarPerfil(fila: Record<string, unknown>, email?: string | null): PerfilUsuario {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const cedula = texto(fila.cedula_rif);
  const telefono = texto(fila.telefono);
  const bandera = (v: unknown) => (typeof v === 'boolean' ? v : null);
  return {
    id: String(fila.id),
    email: email ?? undefined,
    nombre_completo: texto(fila.nombre_completo),
    cedula_rif: cedula && normalizarCedula(cedula) ? cedula : undefined,
    telefono: telefono && normalizarTelefono(telefono) ? telefono : undefined,
    notif_boletos: bandera(fila.notif_boletos),
    notif_encomiendas: bandera(fila.notif_encomiendas),
    notif_recordatorios: bandera(fila.notif_recordatorios),
    created_at: String(fila.created_at ?? ''),
  };
}

/** Qué le falta a un perfil para comprar o enviar. */
export function camposFaltantes(perfil: PerfilUsuario | null): CampoPerfil[] {
  if (!perfil) return ['nombre', 'cedula', 'telefono'];
  const faltan: CampoPerfil[] = [];
  if (!nombreValido(perfil.nombre_completo)) faltan.push('nombre');
  if (!cedulaValida(perfil.cedula_rif ?? '')) faltan.push('cedula');
  if (!telefonoValido(perfil.telefono ?? '')) faltan.push('telefono');
  return faltan;
}

/**
 * true si la cuenta tiene contraseña (proveedor `email`); false si solo entra
 * con Google. Perfil muestra "Cambiar contraseña" o "Crear una contraseña" y
 * `/cuenta/contrasena` decide si pide la actual (#50). Sin datos del proveedor
 * se asume correo (pedir la actual es lo prudente).
 */
export function tieneContrasena(user: User | null | undefined): boolean {
  if (!user) return false;
  const meta = user.app_metadata ?? {};
  const proveedores = [
    ...(Array.isArray(meta.providers) ? (meta.providers as unknown[]) : []),
    ...(typeof meta.provider === 'string' ? [meta.provider] : []),
    ...(user.identities ?? []).map((i) => i.provider),
  ].filter((p): p is string => typeof p === 'string');
  if (proveedores.length === 0) return true;
  return proveedores.includes('email');
}

// Todas las instancias montadas reciben el perfil recién guardado.
const oyentes = new Set<(p: PerfilUsuario) => void>();

export function usePerfil(): UsePerfil {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const email = user?.email ?? null;

  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    const oyente = (p: PerfilUsuario) => {
      if (montado.current && p.id === userId) setPerfil(p);
    };
    oyentes.add(oyente);
    return () => {
      montado.current = false;
      oyentes.delete(oyente);
    };
  }, [userId]);

  const recargar = useCallback(async () => {
    if (!userId) {
      setPerfil(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select(COLUMNAS)
        .eq('id', userId)
        .single();
      if (err) throw err;
      if (montado.current) setPerfil(limpiarPerfil(data, email));
    } catch (err) {
      if (__DEV__) console.warn('[usePerfil] cargar:', err);
      if (montado.current) setError(humanizeError(err, 'perfil'));
    } finally {
      if (montado.current) setLoading(false);
    }
  }, [userId, email]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const guardar = useCallback(
    async (d: DatosPerfil): Promise<PerfilUsuario> => {
      if (!userId) throw new AppError('Tu sesión expiró. Inicia sesión de nuevo.');

      const nombre = sanitizeText(d.nombre_completo);
      if (!nombreValido(nombre)) throw new AppError('Escribe tu nombre y apellido.');
      const cedula = cedulaParaGuardar(d.cedula_rif);
      if (!cedula) throw new AppError(MENSAJE_CEDULA);
      const telefono = telefonoParaGuardar(d.telefono);
      if (!telefono) throw new AppError(MENSAJE_TELEFONO);

      const { data, error: err } = await supabase
        .from('profiles')
        .update({ nombre_completo: nombre, cedula_rif: cedula, telefono })
        .eq('id', userId)
        .select(COLUMNAS)
        .single();

      if (err) {
        if (err.code === '23505') {
          const detalle = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
          throw new AppError(detalle.includes('telefono') ? MENSAJE_TELEFONO_USADO : MENSAJE_CEDULA_USADA);
        }
        throw new AppError(humanizeError(err, 'perfil'));
      }

      const guardado = limpiarPerfil(data, email);
      oyentes.forEach((oyente) => oyente(guardado));
      return guardado;
    },
    [userId, email]
  );

  const guardarNotificaciones = useCallback(
    async (cambios: PreferenciasNotificacion): Promise<PerfilUsuario> => {
      if (!userId) throw new AppError('Tu sesión expiró. Inicia sesión de nuevo.');
      const fila: PreferenciasNotificacion = {};
      (['notif_boletos', 'notif_encomiendas', 'notif_recordatorios'] as const).forEach((k) => {
        if (typeof cambios[k] === 'boolean') fila[k] = cambios[k];
      });
      if (Object.keys(fila).length === 0) throw new AppError('No hay cambios que guardar.');

      const { data, error: err } = await supabase
        .from('profiles')
        .update(fila)
        .eq('id', userId)
        .select(COLUMNAS)
        .single();
      if (err) throw new AppError(humanizeError(err, 'perfil'));

      const guardado = limpiarPerfil(data, email);
      oyentes.forEach((oyente) => oyente(guardado));
      return guardado;
    },
    [userId, email]
  );

  const faltan = useMemo(() => camposFaltantes(perfil), [perfil]);

  return {
    perfil,
    completo: !!perfil && faltan.length === 0,
    faltan,
    loading,
    error,
    recargar,
    guardar,
    guardarNotificaciones,
  };
}
