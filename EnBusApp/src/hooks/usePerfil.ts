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
 * Todas las instancias del hook se actualizan cuando una guarda.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
}

const COLUMNAS = 'id, nombre_completo, cedula_rif, telefono, created_at';

export const MENSAJE_CEDULA_USADA =
  'Esa cédula ya está registrada en otra cuenta. Si es tuya, entra con esa cuenta o escríbenos por WhatsApp.';
export const MENSAJE_TELEFONO_USADO =
  'Ese teléfono ya está registrado en otra cuenta. Si es tuyo, entra con esa cuenta o escríbenos por WhatsApp.';

/** Quita los marcadores `PENDIENTE-…` del alta con Google. */
function limpiarPerfil(fila: Record<string, unknown>, email?: string | null): PerfilUsuario {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const cedula = texto(fila.cedula_rif);
  const telefono = texto(fila.telefono);
  return {
    id: String(fila.id),
    email: email ?? undefined,
    nombre_completo: texto(fila.nombre_completo),
    cedula_rif: cedula && normalizarCedula(cedula) ? cedula : undefined,
    telefono: telefono && normalizarTelefono(telefono) ? telefono : undefined,
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

  const faltan = useMemo(() => camposFaltantes(perfil), [perfil]);

  return {
    perfil,
    completo: !!perfil && faltan.length === 0,
    faltan,
    loading,
    error,
    recargar,
    guardar,
  };
}
