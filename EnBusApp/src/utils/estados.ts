/**
 * Single source of truth for how a domain state is presented to the user.
 *
 * Before this file, the same `estado` string was mapped to a colour and a label
 * in four different places (TransactionCard, boletos/[id], ResultsList and each
 * detail screen), each with a slightly different result. Every badge, banner and
 * pill now resolves through `getEstadoVisual` (boletos: `getEstadoBoletoVisual`,
 * que separa la reserva sin pagar del pago en verificación; encomiendas: el
 * cobro va aparte en `getCobroEncomienda`).
 *
 * Las etiquetas son la columna "pasajero" del glosario (fase 3, §4 de
 * `Audits/fase3_spec.md`; `Specs/00_General/Glosario.md`). Los tonos del
 * glosario se traducen así: pendiente → `pending`, exito → `success`,
 * info → `progress`, peligro → `danger`, terminado y neutro → `neutral`.
 */

import type { StatusTone } from '@/src/theme';
import type {
  CategoriaReporte,
  EstadoUiBoleto,
  EstadoVerificacionPago,
  ModalidadPago,
  PagoEstadoMinimo,
  TipoMetodoPago,
} from '@/src/types';

export interface EstadoVisual {
  /** Human-readable label in Spanish, already cased for display */
  label: string;
  /** Semantic tone — maps to colours via `StatusPalette` */
  tone: StatusTone;
  /** One-line explanation of what the state means for the user */
  hint?: string;
}

// ─── Boletos ─────────────────────────────────────────────────────────────────

/**
 * Claves: los estados del enum y los subestados de RESERVADO que calcula
 * `getEstadoBoletoUi` (espejo de `estado_ui_boleto` en la base). RESERVADO a
 * secas solo aparece si una pantalla no pasa el boleto por `getEstadoBoletoUi`.
 */
const BOLETO: Record<string, EstadoVisual> = {
  RESERVA_SIN_PAGAR: {
    label: 'Sin pagar',
    tone: 'pending',
    hint: 'Tu asiento está apartado. Registra tu pago antes de que venza la reserva.',
  },
  PAGO_EN_VERIFICACION: {
    label: 'Pago en verificación',
    tone: 'pending',
    hint: 'La cooperativa está revisando tu pago. Tu asiento sigue apartado mientras tanto.',
  },
  PAGO_RECHAZADO: {
    label: 'Pago rechazado',
    tone: 'danger',
    hint: 'La cooperativa no pudo confirmar tu pago. Revisa el motivo y regístralo de nuevo.',
  },
  RESERVADO: {
    label: 'Apartado',
    tone: 'pending',
    hint: 'Tu asiento está apartado.',
  },
  PAGADO: {
    label: 'Confirmado',
    tone: 'success',
    hint: 'Tu pase de abordaje está listo.',
  },
  USADO: {
    label: 'Viaje realizado',
    tone: 'neutral',
    hint: 'Ya abordaste con este boleto.',
  },
  CANCELADO: {
    label: 'Cancelado',
    tone: 'neutral',
    hint: 'El boleto se canceló y el asiento quedó libre.',
  },
  EXPIRADO: {
    label: 'Vencido',
    tone: 'neutral',
    hint: 'La reserva venció sin pago y el asiento se liberó.',
  },
  // Derivados de un boleto CANCELADO con devolución (`getEstadoReembolso`).
  REEMBOLSO_PENDIENTE: {
    label: 'Reembolso pendiente',
    tone: 'pending',
    hint: 'La cooperativa te devolverá el dinero en 1 a 2 días hábiles.',
  },
  REEMBOLSADO: {
    label: 'Reembolsado',
    tone: 'success',
    hint: 'La cooperativa ya te devolvió el dinero.',
  },
};

// ─── Encomiendas ─────────────────────────────────────────────────────────────

const ENCOMIENDA: Record<string, EstadoVisual> = {
  PENDIENTE_DE_ESCANEO: {
    label: 'Por entregar en taquilla',
    tone: 'pending',
    hint: 'Lleva el paquete a la taquilla de la cooperativa y muestra el código QR.',
  },
  EN_RECEPCION: {
    label: 'Recibiéndose en taquilla',
    tone: 'pending',
    hint: 'La taquilla está revisando y pesando el paquete.',
  },
  POR_PAGAR: {
    label: 'Pago pendiente',
    tone: 'pending',
    hint: 'La taquilla ya calculó el costo. Falta pagar el envío.',
  },
  PAGADA: {
    label: 'Pagada · por salir',
    tone: 'progress',
    hint: 'El envío está pagado y saldrá en el próximo bus.',
  },
  EN_TRANSITO: {
    label: 'En camino',
    tone: 'progress',
    hint: 'El paquete va en camino a la ciudad de destino.',
  },
  EN_OFICINA_DESTINO: {
    label: 'Lista para retirar',
    tone: 'success',
    hint: 'Ya se puede retirar en la oficina de destino con la cédula y el PIN.',
  },
  ENTREGADA: {
    label: 'Entregada',
    tone: 'success',
    hint: 'El paquete fue entregado.',
  },
  CANCELADA: {
    label: 'Cancelada',
    tone: 'neutral',
    hint: 'Este envío fue cancelado.',
  },
  DEVUELTA: {
    label: 'Devuelta al remitente',
    tone: 'neutral',
    hint: 'Nadie la retiró a tiempo y volvió a quien la envió.',
  },
};

// ─── Viajes, pagos, reembolsos y reportes ────────────────────────────────────

const VIAJE: Record<string, EstadoVisual> = {
  PROGRAMADO: { label: 'Programado', tone: 'progress' },
  EN_CURSO: { label: 'En ruta', tone: 'progress' },
  COMPLETADO: { label: 'Completado', tone: 'neutral' },
  CANCELADO: { label: 'Cancelado', tone: 'neutral' },
};

const PAGO: Record<string, EstadoVisual> = {
  PENDIENTE: {
    label: 'En verificación',
    tone: 'pending',
    hint: 'La cooperativa está revisando tu pago.',
  },
  APROBADO: { label: 'Confirmado', tone: 'success' },
  RECHAZADO: {
    label: 'Rechazado',
    tone: 'danger',
    hint: 'La cooperativa no pudo confirmar el pago.',
  },
};

const REEMBOLSO: Record<string, EstadoVisual> = {
  PENDIENTE: BOLETO.REEMBOLSO_PENDIENTE,
  PROCESADO: BOLETO.REEMBOLSADO,
};

/** Reportes del usuario (`incidencias`). */
const INCIDENCIA: Record<string, EstadoVisual> = {
  ABIERTA: { label: 'Recibido', tone: 'danger', hint: 'Recibimos tu reporte.' },
  EN_PROCESO: { label: 'En revisión', tone: 'pending', hint: 'Estamos revisando tu reporte.' },
  RESUELTA: { label: 'Resuelto', tone: 'success' },
};

export type EstadoDominio = 'boleto' | 'encomienda' | 'viaje' | 'pago' | 'reembolso' | 'incidencia';

const TABLAS: Record<EstadoDominio, Record<string, EstadoVisual>> = {
  boleto: BOLETO,
  encomienda: ENCOMIENDA,
  viaje: VIAJE,
  pago: PAGO,
  reembolso: REEMBOLSO,
  incidencia: INCIDENCIA,
};

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
  return TABLAS[dominio][estado] ?? fallback(estado);
}

// ─── Vocabulario del glosario ────────────────────────────────────────────────

/** Quién paga el envío. `corto` en insignias y resúmenes; `largo` en explicaciones. */
export const MODALIDAD_PAGO: Record<ModalidadPago, { corto: string; largo: string }> = {
  ORIGEN: { corto: 'Paga al enviar', largo: 'Paga quien envía, al entregar el paquete' },
  DESTINO: { corto: 'Paga al retirar', largo: 'Paga quien recibe, al retirarlo' },
};

/** Métodos de pago (y de devolución de un reembolso). */
export const METODO_PAGO: Record<TipoMetodoPago, string> = {
  PAGO_MOVIL: 'Pago Móvil',
  TRANSFERENCIA_BANCARIA: 'Transferencia',
  ZELLE: 'Zelle',
  EFECTIVO: 'Efectivo',
};

/** Categorías de "Reportar un problema" (`fn_reportar_problema`). */
export const CATEGORIA_REPORTE: Record<CategoriaReporte, string> = {
  PAGO: 'Pago',
  BOLETO: 'Boleto',
  ENCOMIENDA: 'Encomienda',
  CUENTA: 'Mi cuenta',
  OTRO: 'Otro',
};

// ─── Pagos: estado de verificación ───────────────────────────────────────────

/**
 * Estado de verificación de un pago. Usa la columna generada
 * `estado_verificacion` (o `estado` en los resúmenes de las RPC) y, si la
 * consulta no la trajo, la deduce de `verificado` / `rechazado_at`.
 */
export function getEstadoVerificacionPago(
  pago: PagoEstadoMinimo | null | undefined
): EstadoVerificacionPago | null {
  if (!pago) return null;
  const directo = pago.estado_verificacion ?? pago.estado;
  if (directo === 'PENDIENTE' || directo === 'APROBADO' || directo === 'RECHAZADO') return directo;
  if (pago.verificado) return 'APROBADO';
  if (pago.rechazado_at) return 'RECHAZADO';
  if (pago.verificado === false) return 'PENDIENTE';
  return null;
}

// ─── Boletos: estado que ve el usuario ───────────────────────────────────────

/** Lo que `getEstadoBoletoUi` necesita de un boleto (fila, embed o resumen de RPC). */
export interface BoletoParaEstadoUi {
  estado?: string | null;
  /** Ya calculado por el servidor (`Resumen.boletos[].estado_ui`) */
  estado_ui?: string | null;
  /** Embed `pago:pagos!boletos_pago_id_fkey(...)`; PostgREST puede devolverlo como arreglo */
  pago?: PagoEstadoMinimo | PagoEstadoMinimo[] | null;
  /** USD a devolver si se canceló un boleto pagado */
  monto_reembolso?: number | string | null;
  reembolso_procesado?: boolean | null;
}

// ─── Boletos: reembolso ──────────────────────────────────────────────────────

/** Situación de la devolución de un boleto cancelado. */
export type EstadoReembolso = 'PENDIENTE' | 'PROCESADO';

/**
 * `PENDIENTE` si el boleto se canceló con dinero por devolver y la cooperativa
 * aún no registró la devolución; `PROCESADO` si ya la registró; `null` si no
 * hay reembolso (no estaba cancelado o se canceló sin haber pagado).
 */
export function getEstadoReembolso(boleto: BoletoParaEstadoUi | null | undefined): EstadoReembolso | null {
  if (!boleto || boleto.estado !== 'CANCELADO') return null;
  if (boleto.reembolso_procesado) return 'PROCESADO';
  return Number(boleto.monto_reembolso) > 0 ? 'PENDIENTE' : null;
}

/**
 * Espejo de `estado_ui_boleto(estado, pago.estado_verificacion)`:
 * RESERVADO → RESERVA_SIN_PAGAR / PAGO_EN_VERIFICACION / PAGO_RECHAZADO; el
 * resto de estados se devuelve tal cual. Nunca deduce EXPIRADO por la hora:
 * solo el servidor vence reservas.
 */
export function getEstadoBoletoUi(boleto: BoletoParaEstadoUi | null | undefined): EstadoUiBoleto | null {
  if (!boleto) return null;
  if (boleto.estado_ui) return boleto.estado_ui as EstadoUiBoleto;
  if (!boleto.estado) return null;
  if (boleto.estado !== 'RESERVADO') return boleto.estado as EstadoUiBoleto;
  const pago = Array.isArray(boleto.pago) ? boleto.pago[0] : boleto.pago;
  const verificacion = getEstadoVerificacionPago(pago);
  if (verificacion === 'PENDIENTE') return 'PAGO_EN_VERIFICACION';
  if (verificacion === 'RECHAZADO') return 'PAGO_RECHAZADO';
  return 'RESERVA_SIN_PAGAR';
}

/**
 * Etiqueta, tono y explicación del estado que ve el usuario. Con
 * `conReembolso`, un boleto cancelado con devolución se muestra como
 * "Reembolso pendiente" / "Reembolsado" en lugar de "Cancelado" (para eso la
 * consulta debe traer `monto_reembolso` y `reembolso_procesado`).
 */
export function getEstadoBoletoVisual(
  boleto: BoletoParaEstadoUi | null | undefined,
  opciones: { conReembolso?: boolean } = {}
): EstadoVisual {
  if (opciones.conReembolso) {
    const reembolso = getEstadoReembolso(boleto);
    if (reembolso) return getEstadoVisual('reembolso', reembolso);
  }
  return getEstadoVisual('boleto', getEstadoBoletoUi(boleto));
}

/** El temporizador de la reserva solo corre sin pago o con el pago rechazado. */
export function reservaPuedeVencer(estadoUi: EstadoUiBoleto | null | undefined): boolean {
  return estadoUi === 'RESERVA_SIN_PAGAR' || estadoUi === 'PAGO_RECHAZADO';
}

// ─── Encomiendas: cobro ──────────────────────────────────────────────────────

/**
 * Situación del cobro de una encomienda (independiente del estado logístico):
 * - `COSTO_PENDIENTE`: la taquilla aún no pesó el paquete.
 * - `SIN_PAGO`: hay costo y no hay pago registrado.
 * - `EN_VERIFICACION`: hay un pago digital esperando a la cooperativa.
 * - `RECHAZADO`: el último pago fue rechazado (se puede registrar otro).
 * - `PAGADO`: hay un pago aprobado, o el estado prueba que se cobró.
 * - `NO_APLICA`: envío cancelado o devuelto sin pago.
 */
export type EstadoCobroEncomienda =
  | 'COSTO_PENDIENTE'
  | 'SIN_PAGO'
  | 'EN_VERIFICACION'
  | 'RECHAZADO'
  | 'PAGADO'
  | 'NO_APLICA';

const COBRO: Record<EstadoCobroEncomienda, EstadoVisual> = {
  COSTO_PENDIENTE: {
    label: 'Costo por calcular',
    tone: 'neutral',
    hint: 'El costo se calcula cuando la taquilla pesa el paquete.',
  },
  SIN_PAGO: {
    label: 'Sin pagar',
    tone: 'pending',
    hint: 'Falta pagar el envío.',
  },
  EN_VERIFICACION: {
    label: 'Pago en verificación',
    tone: 'pending',
    hint: 'La cooperativa está revisando tu pago.',
  },
  RECHAZADO: {
    label: 'Pago rechazado',
    tone: 'danger',
    hint: 'La cooperativa no pudo confirmar el pago. Revisa el motivo y regístralo de nuevo.',
  },
  PAGADO: {
    label: 'Pago confirmado',
    tone: 'success',
    hint: 'El envío está pagado.',
  },
  NO_APLICA: {
    label: 'Sin cobro',
    tone: 'neutral',
  },
};

export interface CobroEncomienda<P extends PagoEstadoMinimo = PagoEstadoMinimo> {
  estado: EstadoCobroEncomienda;
  /** Pago que explica el estado (aprobado, pendiente o el último rechazado) */
  pago: P | null;
  /** Motivo del último rechazo, si el estado es RECHAZADO */
  motivoRechazo: string | null;
  visual: EstadoVisual;
}

/** Lo que `getCobroEncomienda` necesita de una encomienda. */
export interface EncomiendaParaCobro {
  estado?: string | null;
  modalidad_pago?: string | null;
  costo_calculado?: number | string | null;
}

const ESTADOS_TRAS_COBRO_ORIGEN = ['PAGADA', 'EN_TRANSITO', 'EN_OFICINA_DESTINO', 'ENTREGADA'];

/**
 * Estado del cobro a partir de la encomienda y de los pagos que el usuario
 * puede leer (`pagos` con `estado_verificacion`, o `verificado`/`rechazado_at`).
 * Un pago aprobado manda; si no lo vemos (lo registró la taquilla), el estado
 * logístico lo prueba: PAGADA, o ORIGEN ya en camino, o ENTREGADA.
 */
export function getCobroEncomienda<P extends PagoEstadoMinimo>(
  enc: EncomiendaParaCobro | null | undefined,
  pagos: readonly P[] | null | undefined = []
): CobroEncomienda<P> {
  const resultado = (estado: EstadoCobroEncomienda, pago: P | null = null): CobroEncomienda<P> => ({
    estado,
    pago,
    motivoRechazo: estado === 'RECHAZADO' ? (pago?.motivo_rechazo ?? null) : null,
    visual: COBRO[estado],
  });

  const lista = [...(pagos ?? [])].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  );
  const conEstado = (e: EstadoVerificacionPago) =>
    lista.find((p) => getEstadoVerificacionPago(p) === e) ?? null;

  const aprobado = conEstado('APROBADO');
  if (aprobado) return resultado('PAGADO', aprobado);
  const pendiente = conEstado('PENDIENTE');
  if (pendiente) return resultado('EN_VERIFICACION', pendiente);

  const estado = enc?.estado ?? '';
  const destino = enc?.modalidad_pago === 'DESTINO';
  if (
    estado === 'PAGADA' ||
    estado === 'ENTREGADA' ||
    (!destino && ESTADOS_TRAS_COBRO_ORIGEN.includes(estado))
  ) {
    return resultado('PAGADO');
  }

  const rechazado = conEstado('RECHAZADO');
  if (estado === 'CANCELADA' || estado === 'DEVUELTA') return resultado('NO_APLICA');
  if (!(Number(enc?.costo_calculado) > 0)) return resultado('COSTO_PENDIENTE');
  if (rechazado) return resultado('RECHAZADO', rechazado);
  return resultado('SIN_PAGO');
}

/**
 * Si el usuario puede registrar un pago desde la app (mismas reglas que
 * `fn_registrar_pago_encomienda`):
 * - DESTINO: remitente o destinatario, de POR_PAGAR a EN_OFICINA_DESTINO.
 * - ORIGEN: solo el remitente, en POR_PAGAR.
 * Siempre con costo calculado y sin pago pendiente ni aprobado.
 */
export function puedePagarEncomienda(
  enc: EncomiendaParaCobro | null | undefined,
  cobro: CobroEncomienda<PagoEstadoMinimo> | EstadoCobroEncomienda,
  rol: 'remitente' | 'destinatario'
): boolean {
  if (!enc) return false;
  const estadoCobro = typeof cobro === 'string' ? cobro : cobro.estado;
  if (estadoCobro !== 'SIN_PAGO' && estadoCobro !== 'RECHAZADO') return false;
  if (!(Number(enc.costo_calculado) > 0)) return false;
  const estado = enc.estado ?? '';
  if (enc.modalidad_pago === 'DESTINO') {
    return ['POR_PAGAR', 'EN_TRANSITO', 'EN_OFICINA_DESTINO'].includes(estado);
  }
  return rol === 'remitente' && estado === 'POR_PAGAR';
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

// ─── Encomiendas: etapas de la timeline ──────────────────────────────────────

/**
 * APP-44 / M-46: the timeline used to be a list of `estado` values, so any
 * state missing from it (PAGADA, CANCELADA…) marked
 * every stage as done, including "Entregada". Now each `estado` maps to one
 * *stage* here, and both the sender and the receiver screens derive their
 * timeline from this single table.
 */
export type EncomiendaEtapa = 'CREADA' | 'RECIBIDA' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADA';

export const ENCOMIENDA_ETAPAS: readonly { id: EncomiendaEtapa; label: string }[] = [
  { id: 'CREADA', label: 'Envío creado' },
  { id: 'RECIBIDA', label: 'Recibida en taquilla' },
  { id: 'EN_TRANSITO', label: 'En camino' },
  { id: 'EN_DESTINO', label: 'Lista para retirar' },
  { id: 'ENTREGADA', label: 'Entregada' },
];

/** `estado` → stage. `null` = terminal state that cuts the timeline. */
export const ENCOMIENDA_ETAPA: Record<string, EncomiendaEtapa | null> = {
  PENDIENTE_DE_ESCANEO: 'CREADA',
  EN_RECEPCION: 'RECIBIDA',
  POR_PAGAR: 'RECIBIDA',
  PAGADA: 'RECIBIDA',
  EN_TRANSITO: 'EN_TRANSITO',
  EN_OFICINA_DESTINO: 'EN_DESTINO',
  ENTREGADA: 'ENTREGADA',
  CANCELADA: null,
  DEVUELTA: null,
};

/** Label of the red node that closes a cancelled or returned shipment. */
const ENCOMIENDA_CORTE: Record<string, string> = {
  CANCELADA: 'Envío cancelado',
  DEVUELTA: 'Devuelta al remitente',
};

export interface EtapaTimeline {
  id: EncomiendaEtapa | 'CORTE';
  label: string;
  /** ISO timestamp of the first time the stage was reached, if known */
  fecha: string | null;
  situacion: 'completada' | 'actual' | 'pendiente' | 'cortada';
}

/**
 * Builds the shipment timeline from the current `estado` and its history.
 * "Entregada" is only ever completed when the state is ENTREGADA; CANCELADA and
 * DEVUELTA keep the stages reached so far and end in a red node.
 */
export function getEncomiendaTimeline(
  estado: string | null | undefined,
  historial: readonly { estado_nuevo: string; created_at: string }[] = [],
  creadaAt?: string | null
): EtapaTimeline[] {
  const indexOf = (etapa: EncomiendaEtapa) => ENCOMIENDA_ETAPAS.findIndex((e) => e.id === etapa);

  /** First time each stage was reached, from the state history. */
  const fechas = new Map<EncomiendaEtapa, string>();
  if (creadaAt) fechas.set('CREADA', creadaAt);
  for (const h of historial) {
    const etapa = ENCOMIENDA_ETAPA[h.estado_nuevo];
    if (etapa && !fechas.has(etapa)) fechas.set(etapa, h.created_at);
  }

  /** Furthest stage the history proves the shipment reached. */
  const etapaMasLejana = (): number => {
    let max = 0;
    for (const h of historial) {
      const etapa = ENCOMIENDA_ETAPA[h.estado_nuevo];
      if (etapa) max = Math.max(max, indexOf(etapa));
    }
    return max;
  };

  const etapaActual = estado ? ENCOMIENDA_ETAPA[estado] : undefined;
  const esCorte = !!estado && etapaActual === null;

  if (esCorte) {
    const alcanzada = etapaMasLejana();
    const corte = [...historial].reverse().find((h) => h.estado_nuevo === estado);
    return [
      ...ENCOMIENDA_ETAPAS.slice(0, alcanzada + 1).map((e) => ({
        id: e.id,
        label: e.label,
        fecha: fechas.get(e.id) ?? null,
        situacion: 'completada' as const,
      })),
      {
        id: 'CORTE' as const,
        label: ENCOMIENDA_CORTE[estado as string] ?? getEstadoVisual('encomienda', estado).label,
        fecha: corte?.created_at ?? null,
        situacion: 'cortada' as const,
      },
    ];
  }

  // Unknown state: trust only what the history proves, never jump ahead.
  const actual = etapaActual ? indexOf(etapaActual) : etapaMasLejana();
  const entregada = estado === 'ENTREGADA';

  return ENCOMIENDA_ETAPAS.map((e, i) => ({
    id: e.id,
    label: e.label,
    fecha: i <= actual ? (fechas.get(e.id) ?? null) : null,
    situacion:
      i < actual || (entregada && i === actual)
        ? ('completada' as const)
        : i === actual
          ? ('actual' as const)
          : ('pendiente' as const),
  }));
}
