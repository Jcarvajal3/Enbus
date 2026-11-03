/**
 * Notificaciones (#49): adónde lleva cada una, con qué icono se muestra y cómo
 * se agrupa la lista por día. Lo usan la push (`app/_layout.tsx`) y la pantalla
 * de notificaciones.
 */

import type React from 'react';
import type { Router } from 'expo-router';
import {
  ArrowCounterClockwise,
  ArrowUUpLeft,
  Bell,
  CalendarX,
  CheckCircle,
  Clock,
  Hourglass,
  Package,
  Prohibit,
  Ticket,
  XCircle,
  type IconProps,
} from 'phosphor-react-native';
import { supabase } from './supabase';

export type PhosphorIcon = React.ComponentType<IconProps>;

export type RecursoNotificacion = { recurso_tipo?: string | null; recurso_id?: string | null };

export type TonoNotificacion = 'exito' | 'info' | 'aviso' | 'peligro' | 'neutro';

// ─── Abrir el recurso ────────────────────────────────────────────────────────

/**
 * Abre el boleto, la encomienda o el viaje de una notificación. Devuelve
 * `false` si no tiene recurso (la pantalla decide: la push abre la lista, la
 * fila solo se marca como leída).
 *
 * Una encomienda se abre como "enviada" si el usuario es el remitente y como
 * "por recibir" si no; si la consulta falla se abre como enviada (la pantalla
 * de detalle carga igual y dice si no la encuentra).
 */
export async function abrirRecurso(
  router: Router,
  r: RecursoNotificacion,
  userId?: string | null
): Promise<boolean> {
  const tipo = (r.recurso_tipo ?? '').trim().toLowerCase();
  const id = (r.recurso_id ?? '').trim();
  if (!id) return false;

  switch (tipo) {
    case 'boleto':
      router.push({ pathname: '/boletos/[id]', params: { id } });
      return true;
    case 'viaje':
      router.push({ pathname: '/viajes/[id]', params: { id } });
      return true;
    case 'encomienda': {
      const rol = await rolEnEncomienda(id, userId);
      router.push({
        pathname: rol === 'recibir' ? '/encomiendas/recibir/[id]' : '/encomiendas/enviar/[id]',
        params: { id },
      });
      return true;
    }
    default:
      return false;
  }
}

async function rolEnEncomienda(id: string, userId?: string | null): Promise<'enviar' | 'recibir'> {
  try {
    const uid = userId ?? (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const { data, error } = await supabase
      .from('encomiendas')
      .select('sender_id')
      .eq('id', id)
      .maybeSingle();
    if (error || !data || !uid) return 'enviar';
    return (data as { sender_id: string | null }).sender_id === uid ? 'enviar' : 'recibir';
  } catch {
    return 'enviar';
  }
}

// ─── Icono y tono ────────────────────────────────────────────────────────────

const POR_TIPO: Record<string, { icon: PhosphorIcon; tono: TonoNotificacion }> = {
  BOLETO_CONFIRMADO: { icon: CheckCircle, tono: 'exito' },
  PAGO_APROBADO: { icon: CheckCircle, tono: 'exito' },
  PAGO_RECHAZADO: { icon: XCircle, tono: 'peligro' },
  ENCOMIENDA_RECHAZADA: { icon: XCircle, tono: 'peligro' },
  PAGO_EN_VERIFICACION: { icon: Hourglass, tono: 'aviso' },
  RESERVA_SIN_PAGAR: { icon: Clock, tono: 'aviso' },
  VIAJE_CANCELADO: { icon: Prohibit, tono: 'peligro' },
  VIAJE_REPROGRAMADO: { icon: CalendarX, tono: 'aviso' },
  REEMBOLSO_ENVIADO: { icon: ArrowCounterClockwise, tono: 'exito' },
  ENCOMIENDA_PARA_TI: { icon: Package, tono: 'info' },
  DEVOLUCION_AUTOMATICA: { icon: ArrowUUpLeft, tono: 'aviso' },
};

/**
 * Icono y tono de una notificación: por `tipo` (fase 4) y, en las filas
 * antiguas o los tipos que no están en la tabla, por `recurso_tipo`.
 */
export function iconoNotificacion(n: {
  tipo?: string | null;
  recurso_tipo?: string | null;
}): { icon: PhosphorIcon; tono: TonoNotificacion } {
  const porTipo = n.tipo ? POR_TIPO[n.tipo.trim().toUpperCase()] : undefined;
  if (porTipo) return porTipo;
  switch ((n.recurso_tipo ?? '').trim().toLowerCase()) {
    case 'boleto':
      return { icon: Ticket, tono: 'info' };
    case 'encomienda':
      return { icon: Package, tono: 'info' };
    default:
      return { icon: Bell, tono: 'neutro' };
  }
}

// ─── Agrupar por día ─────────────────────────────────────────────────────────

/** Venezuela está en UTC−4 todo el año (sin horario de verano desde 2016). */
const OFFSET_VE_MS = -4 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Número de día calendario en hora de Venezuela (para restar días). */
function diaVE(ms: number): number {
  return Math.floor((ms + OFFSET_VE_MS) / DIA_MS);
}

export type TituloGrupoDia = 'Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores';

const ORDEN_GRUPOS: TituloGrupoDia[] = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'];

/**
 * Secciones "Hoy", "Ayer", "Esta semana" (de 2 a 6 días atrás) y "Anteriores",
 * en ese orden, con los días en hora de Venezuela. Conserva el orden de los
 * elementos dentro de cada sección y omite las vacías (lista lista para
 * `SectionList`). Una fecha ilegible cuenta como "Anteriores".
 */
export function agruparPorDia<T extends { created_at: string }>(
  items: T[],
  ahora: Date = new Date()
): { titulo: TituloGrupoDia; data: T[] }[] {
  const hoy = diaVE(ahora.getTime());
  const grupos = new Map<TituloGrupoDia, T[]>();
  for (const item of items) {
    const ms = new Date(item.created_at).getTime();
    const dias = Number.isNaN(ms) ? Infinity : hoy - diaVE(ms);
    const titulo: TituloGrupoDia =
      dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : dias <= 6 ? 'Esta semana' : 'Anteriores';
    const lista = grupos.get(titulo) ?? [];
    lista.push(item);
    grupos.set(titulo, lista);
  }
  return ORDEN_GRUPOS.filter((t) => grupos.has(t)).map((titulo) => ({
    titulo,
    data: grupos.get(titulo) ?? [],
  }));
}
