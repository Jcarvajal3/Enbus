/**
 * Single source of truth for how a domain state is presented to the user.
 *
 * Before this file, the same `estado` string was mapped to a colour and a label
 * in four different places (TransactionCard, boletos/[id], ResultsList and each
 * detail screen), each with a slightly different result. Every badge, banner and
 * pill now resolves through `getEstadoVisual`.
 */

import type { StatusTone } from '@/src/theme';

export interface EstadoVisual {
  /** Human-readable label in Spanish, already cased for display */
  label: string;
  /** Semantic tone — maps to colours via `StatusPalette` */
  tone: StatusTone;
  /** One-line explanation of what the state means for the user */
  hint?: string;
}

// ─── Boletos ─────────────────────────────────────────────────────────────────

const BOLETO: Record<string, EstadoVisual> = {
  RESERVADO: {
    label: 'Reservado',
    tone: 'pending',
    hint: 'Pendiente de que la cooperativa verifique tu pago.',
  },
  PAGADO: {
    label: 'Confirmado',
    tone: 'success',
    hint: 'Tu pase de abordaje está listo.',
  },
  USADO: {
    label: 'Viaje completado',
    tone: 'neutral',
    hint: 'Este boleto ya fue utilizado.',
  },
  CANCELADO: {
    label: 'Cancelado',
    tone: 'danger',
    hint: 'La reserva fue cancelada y el asiento liberado.',
  },
  EXPIRADO: {
    label: 'Expirado',
    tone: 'neutral',
    hint: 'El tiempo para pagar la reserva terminó y el asiento se liberó.',
  },
};

// ─── Encomiendas ─────────────────────────────────────────────────────────────

const ENCOMIENDA: Record<string, EstadoVisual> = {
  PENDIENTE_DE_ESCANEO: {
    label: 'Por entregar en taquilla',
    tone: 'pending',
    hint: 'Muestra el código QR en la taquilla de la cooperativa.',
  },
  EN_RECEPCION: {
    label: 'En recepción',
    tone: 'pending',
    hint: 'La taquilla está procesando tu paquete.',
  },
  POR_PAGAR: {
    label: 'Por pagar',
    tone: 'danger',
    hint: 'Registra el pago para que el envío continúe.',
  },
  PENDIENTE_VERIFICACION: {
    label: 'Pago en verificación',
    tone: 'pending',
    hint: 'La cooperativa está verificando tu comprobante.',
  },
  PAGADA: {
    label: 'Pagada',
    tone: 'progress',
    hint: 'Pago confirmado. El envío continúa su ruta.',
  },
  EN_TRANSITO: {
    label: 'En tránsito',
    tone: 'progress',
    hint: 'Tu paquete va en camino al destino.',
  },
  EN_OFICINA_DESTINO: {
    label: 'Lista para retirar',
    tone: 'success',
    hint: 'Ya puedes retirarla en la oficina de destino.',
  },
  ENTREGADA: {
    label: 'Entregada',
    tone: 'success',
    hint: 'El paquete fue entregado al destinatario.',
  },
  CANCELADA: {
    label: 'Cancelada',
    tone: 'neutral',
    hint: 'Este envío fue cancelado.',
  },
  DEVUELTA: {
    label: 'Devuelta',
    tone: 'danger',
    hint: 'El paquete fue devuelto al remitente.',
  },
};

export type EstadoDominio = 'boleto' | 'encomienda';

/** Fallback for a state the app doesn't know about yet — never crash, never lie. */
function fallback(estado: string): EstadoVisual {
  return {
    label: estado
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase()),
    tone: 'neutral',
  };
}

export function getEstadoVisual(dominio: EstadoDominio, estado?: string | null): EstadoVisual {
  if (!estado) return { label: 'Sin estado', tone: 'neutral' };
  const table = dominio === 'boleto' ? BOLETO : ENCOMIENDA;
  return table[estado] ?? fallback(estado);
}

// ─── State groupings used for filtering ──────────────────────────────────────

export const BOLETO_ESTADOS_ACTIVOS = ['RESERVADO', 'PAGADO'] as const;
export const BOLETO_ESTADOS_HISTORIAL = ['USADO', 'CANCELADO', 'EXPIRADO'] as const;
/** States that keep a seat blocked */
export const BOLETO_ESTADOS_OCUPAN_ASIENTO = ['RESERVADO', 'PAGADO', 'USADO'] as const;

export const ENCOMIENDA_ESTADOS_CERRADOS = ['ENTREGADA', 'CANCELADA', 'DEVUELTA'] as const;

export function isEncomiendaActiva(estado?: string | null): boolean {
  if (!estado) return false;
  return !(ENCOMIENDA_ESTADOS_CERRADOS as readonly string[]).includes(estado);
}
