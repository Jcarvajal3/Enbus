// ─── Estado visible de boletos y encomiendas para el pasajero ────────────────
// Port de EnBusApp/src/utils/estados.ts (columna "pasajero" del glosario). Funciones puras,
// sin servidor ni cliente: sirven en Server Components y en componentes "use client".
// Un estado desconocido se muestra como texto legible con tono neutro, nunca el enum crudo.

/** Tono del chip: ok = éxito, aviso = pendiente, error = problema, info = en curso, neutro = cerrado. */
export type TonoEstado = "ok" | "aviso" | "error" | "neutro" | "info";

export interface EstadoVisible {
  /** Clave estable del estado ("PAGO_EN_VERIFICACION"). */
  codigo: string;
  etiqueta: string;
  /** Una línea que explica qué significa para el pasajero. */
  descripcion: string;
  tono: TonoEstado;
}

function visible(codigo: string, etiqueta: string, tono: TonoEstado, descripcion = ""): EstadoVisible {
  return { codigo, etiqueta, descripcion, tono };
}

function respaldo(codigo: string): EstadoVisible {
  const texto = codigo.replace(/_/g, " ").toLowerCase();
  return visible(codigo, texto.charAt(0).toUpperCase() + texto.slice(1), "neutro");
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

export type EstadoVerificacionPago = "PENDIENTE" | "APROBADO" | "RECHAZADO";

/** Lo que se necesita de un pago para saber en qué situación está (fila, embed o resumen de RPC). */
export interface PagoMinimo {
  estado_verificacion?: string | null;
  /** Resúmenes de las RPC lo llaman `estado`. */
  estado?: string | null;
  verificado?: boolean | null;
  rechazado_at?: string | null;
  motivo_rechazo?: string | null;
  created_at?: string | null;
}

/** Situación de verificación de un pago; null si no hay pago o no se puede deducir. */
export function estadoVerificacionPago(pago: PagoMinimo | null | undefined): EstadoVerificacionPago | null {
  if (!pago) return null;
  const directo = pago.estado_verificacion ?? pago.estado;
  if (directo === "PENDIENTE" || directo === "APROBADO" || directo === "RECHAZADO") return directo;
  if (pago.verificado) return "APROBADO";
  if (pago.rechazado_at) return "RECHAZADO";
  if (pago.verificado === false) return "PENDIENTE";
  return null;
}

// ─── Boletos ─────────────────────────────────────────────────────────────────

const BOLETO: Record<string, EstadoVisible> = {
  RESERVA_SIN_PAGAR: visible(
    "RESERVA_SIN_PAGAR",
    "Sin pagar",
    "aviso",
    "Tu asiento está apartado. Registra tu pago antes de que venza la reserva."
  ),
  PAGO_EN_VERIFICACION: visible(
    "PAGO_EN_VERIFICACION",
    "Pago en verificación",
    "aviso",
    "La cooperativa está revisando tu pago. Tu asiento sigue apartado mientras tanto."
  ),
  PAGO_RECHAZADO: visible(
    "PAGO_RECHAZADO",
    "Pago rechazado",
    "error",
    "La cooperativa no pudo confirmar tu pago. Revisa el motivo y regístralo de nuevo."
  ),
  RESERVADO: visible("RESERVADO", "Apartado", "aviso", "Tu asiento está apartado."),
  PAGADO: visible("PAGADO", "Confirmado", "ok", "Tu pase de abordaje está listo."),
  USADO: visible("USADO", "Viaje realizado", "neutro", "Ya abordaste con este boleto."),
  CANCELADO: visible("CANCELADO", "Cancelado", "neutro", "El boleto se canceló y el asiento quedó libre."),
  EXPIRADO: visible("EXPIRADO", "Vencido", "neutro", "La reserva venció sin pago y el asiento se liberó."),
  REEMBOLSO_PENDIENTE: visible(
    "REEMBOLSO_PENDIENTE",
    "Reembolso pendiente",
    "aviso",
    "La cooperativa te devolverá el dinero en 1 a 2 días hábiles."
  ),
  REEMBOLSADO: visible("REEMBOLSADO", "Reembolsado", "ok", "La cooperativa ya te devolvió el dinero."),
};

/** Lo que `estadoBoleto` necesita de un boleto (fila, embed o resumen de RPC). */
export interface BoletoParaEstado {
  estado?: string | null;
  /** Ya calculado por el servidor (`boletos[].estado_ui`): manda sobre `estado`. */
  estado_ui?: string | null;
  /** Embed `pago:pagos!boletos_pago_id_fkey(...)`; PostgREST puede devolver un arreglo. */
  pago?: PagoMinimo | PagoMinimo[] | null;
  /** USD a devolver si se canceló un boleto pagado. */
  monto_reembolso?: number | string | null;
  reembolso_procesado?: boolean | null;
}

/** Estado que se guarda en BD o que calcula el servidor, sin la capa de reembolso. */
export type EstadoUiBoletoPasajero =
  | "RESERVA_SIN_PAGAR"
  | "PAGO_EN_VERIFICACION"
  | "PAGO_RECHAZADO"
  | "PAGADO"
  | "USADO"
  | "CANCELADO"
  | "EXPIRADO";

/**
 * Espejo de `estado_ui_boleto`: RESERVADO se abre en sin pagar / en verificación / rechazado según
 * el pago; el resto se devuelve igual. Nunca deduce EXPIRADO por la hora: solo el servidor vence reservas.
 */
export function estadoUiBoleto(boleto: BoletoParaEstado | null | undefined): string | null {
  if (!boleto) return null;
  if (boleto.estado_ui) return boleto.estado_ui;
  if (!boleto.estado) return null;
  if (boleto.estado !== "RESERVADO") return boleto.estado;
  const pago = Array.isArray(boleto.pago) ? boleto.pago[0] : boleto.pago;
  const verificacion = estadoVerificacionPago(pago);
  if (verificacion === "PENDIENTE") return "PAGO_EN_VERIFICACION";
  if (verificacion === "RECHAZADO") return "PAGO_RECHAZADO";
  return "RESERVA_SIN_PAGAR";
}

/**
 * Estado visible de un boleto. Un boleto cancelado con dinero por devolver se muestra como
 * "Reembolso pendiente" / "Reembolsado" (la consulta debe traer `monto_reembolso` y
 * `reembolso_procesado`; sin ellos queda "Cancelado"). Con `conReembolso: false` no se aplica.
 */
export function estadoBoleto(
  boleto: BoletoParaEstado | null | undefined,
  opciones: { conReembolso?: boolean } = {}
): EstadoVisible {
  if (!boleto) return visible("SIN_ESTADO", "Sin estado", "neutro");
  const { conReembolso = true } = opciones;
  if (conReembolso && boleto.estado === "CANCELADO") {
    if (boleto.reembolso_procesado) return BOLETO.REEMBOLSADO;
    if (Number(boleto.monto_reembolso) > 0) return BOLETO.REEMBOLSO_PENDIENTE;
  }
  const codigo = estadoUiBoleto(boleto);
  if (!codigo) return visible("SIN_ESTADO", "Sin estado", "neutro");
  return BOLETO[codigo] ?? respaldo(codigo);
}

/** El temporizador de la reserva solo corre sin pago o con el pago rechazado. */
export function reservaPuedeVencer(estadoUi: string | null | undefined): boolean {
  return estadoUi === "RESERVA_SIN_PAGAR" || estadoUi === "PAGO_RECHAZADO";
}

/** Boleto vigente (apartado o pagado): va en "Próximos"; el resto, al historial. */
export function boletoEsVigente(boleto: BoletoParaEstado | null | undefined): boolean {
  return boleto?.estado === "RESERVADO" || boleto?.estado === "PAGADO";
}

// ─── Encomiendas ─────────────────────────────────────────────────────────────

const ENCOMIENDA: Record<string, EstadoVisible> = {
  PENDIENTE_DE_ESCANEO: visible(
    "PENDIENTE_DE_ESCANEO",
    "Por entregar en taquilla",
    "aviso",
    "Lleva el paquete a la taquilla de la cooperativa y muestra el código QR."
  ),
  EN_RECEPCION: visible(
    "EN_RECEPCION",
    "Recibiéndose en taquilla",
    "aviso",
    "La taquilla está revisando y pesando el paquete."
  ),
  POR_PAGAR: visible(
    "POR_PAGAR",
    "Pago pendiente",
    "aviso",
    "La taquilla ya calculó el costo. Falta pagar el envío."
  ),
  PAGADA: visible("PAGADA", "Pagada · por salir", "info", "El envío está pagado y saldrá en el próximo bus."),
  EN_TRANSITO: visible("EN_TRANSITO", "En camino", "info", "El paquete va en camino a la ciudad de destino."),
  EN_OFICINA_DESTINO: visible(
    "EN_OFICINA_DESTINO",
    "Lista para retirar",
    "ok",
    "Ya se puede retirar en la oficina de destino con la cédula y el PIN."
  ),
  ENTREGADA: visible("ENTREGADA", "Entregada", "ok", "El paquete fue entregado."),
  CANCELADA: visible("CANCELADA", "Cancelada", "neutro", "Este envío fue cancelado."),
  DEVUELTA: visible(
    "DEVUELTA",
    "Devuelta al remitente",
    "neutro",
    "Nadie la retiró a tiempo y volvió a quien la envió."
  ),
};

/**
 * Situación del cobro de una encomienda (independiente del estado logístico):
 * - COSTO_PENDIENTE: la taquilla aún no pesó el paquete.
 * - SIN_PAGO: hay costo y no hay pago registrado.
 * - EN_VERIFICACION: hay un pago digital esperando a la cooperativa.
 * - RECHAZADO: el último pago fue rechazado (se puede registrar otro).
 * - PAGADO: hay un pago aprobado, o el estado prueba que se cobró.
 * - NO_APLICA: envío cancelado o devuelto sin pago.
 */
export type EstadoCobroEncomienda =
  | "COSTO_PENDIENTE"
  | "SIN_PAGO"
  | "EN_VERIFICACION"
  | "RECHAZADO"
  | "PAGADO"
  | "NO_APLICA";

const COBRO: Record<EstadoCobroEncomienda, EstadoVisible> = {
  COSTO_PENDIENTE: visible(
    "COSTO_PENDIENTE",
    "Costo por calcular",
    "neutro",
    "El costo se calcula cuando la taquilla pesa el paquete."
  ),
  SIN_PAGO: visible("SIN_PAGO", "Sin pagar", "aviso", "Falta pagar el envío."),
  EN_VERIFICACION: visible(
    "EN_VERIFICACION",
    "Pago en verificación",
    "aviso",
    "La cooperativa está revisando tu pago."
  ),
  RECHAZADO: visible(
    "RECHAZADO",
    "Pago rechazado",
    "error",
    "La cooperativa no pudo confirmar el pago. Revisa el motivo y regístralo de nuevo."
  ),
  PAGADO: visible("PAGADO", "Pago confirmado", "ok", "El envío está pagado."),
  NO_APLICA: visible("NO_APLICA", "Sin cobro", "neutro"),
};

/** Lo que se necesita de una encomienda para calcular su estado y su cobro. */
export interface EncomiendaParaEstado {
  estado?: string | null;
  modalidad_pago?: string | null;
  costo_calculado?: number | string | null;
}

export interface CobroVisible extends EstadoVisible {
  estado: EstadoCobroEncomienda;
  /** Pago que explica el estado (aprobado, pendiente o el último rechazado). */
  pago: PagoMinimo | null;
  /** Motivo del último rechazo, si el estado es RECHAZADO. */
  motivoRechazo: string | null;
}

export interface EstadoEncomiendaVisible {
  /** Estado logístico (dónde va el paquete). */
  estado: EstadoVisible;
  /** Estado del cobro (si falta pagar, si se verifica…). */
  cobro: CobroVisible;
}

const ESTADOS_TRAS_COBRO_ORIGEN = ["PAGADA", "EN_TRANSITO", "EN_OFICINA_DESTINO", "ENTREGADA"];

/** Estado del cobro a partir de la encomienda y de los pagos que el pasajero puede leer. */
export function cobroEncomienda(
  enc: EncomiendaParaEstado | null | undefined,
  pagos: readonly PagoMinimo[] | null | undefined = []
): CobroVisible {
  const resultado = (estado: EstadoCobroEncomienda, pago: PagoMinimo | null = null): CobroVisible => ({
    ...COBRO[estado],
    estado,
    pago,
    motivoRechazo: estado === "RECHAZADO" ? (pago?.motivo_rechazo ?? null) : null,
  });

  const lista = [...(pagos ?? [])].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const con = (e: EstadoVerificacionPago) => lista.find((p) => estadoVerificacionPago(p) === e) ?? null;

  // Un pago aprobado manda; si no lo vemos (lo registró la taquilla), el estado logístico lo prueba.
  const aprobado = con("APROBADO");
  if (aprobado) return resultado("PAGADO", aprobado);
  const pendiente = con("PENDIENTE");
  if (pendiente) return resultado("EN_VERIFICACION", pendiente);

  const estado = enc?.estado ?? "";
  const destino = enc?.modalidad_pago === "DESTINO";
  if (estado === "PAGADA" || estado === "ENTREGADA" || (!destino && ESTADOS_TRAS_COBRO_ORIGEN.includes(estado))) {
    return resultado("PAGADO");
  }

  const rechazado = con("RECHAZADO");
  if (estado === "CANCELADA" || estado === "DEVUELTA") return resultado("NO_APLICA");
  if (!(Number(enc?.costo_calculado) > 0)) return resultado("COSTO_PENDIENTE");
  if (rechazado) return resultado("RECHAZADO", rechazado);
  return resultado("SIN_PAGO");
}

/** Estado logístico y de cobro de una encomienda, con etiqueta, descripción y tono. */
export function estadoEncomienda(
  enc: EncomiendaParaEstado | null | undefined,
  pagos: readonly PagoMinimo[] | null | undefined = []
): EstadoEncomiendaVisible {
  const codigo = enc?.estado;
  const estado = codigo ? (ENCOMIENDA[codigo] ?? respaldo(codigo)) : visible("SIN_ESTADO", "Sin estado", "neutro");
  return { estado, cobro: cobroEncomienda(enc, pagos) };
}

/**
 * Si el pasajero puede registrar un pago (mismas reglas que `fn_registrar_pago_encomienda`):
 * - DESTINO: remitente o destinatario, de POR_PAGAR a EN_OFICINA_DESTINO.
 * - ORIGEN: solo el remitente, en POR_PAGAR.
 * Siempre con costo calculado y sin pago pendiente ni aprobado.
 */
export function puedePagarEncomienda(
  enc: EncomiendaParaEstado | null | undefined,
  cobro: CobroVisible | EstadoCobroEncomienda,
  rol: "remitente" | "destinatario"
): boolean {
  if (!enc) return false;
  const estadoCobro = typeof cobro === "string" ? cobro : cobro.estado;
  if (estadoCobro !== "SIN_PAGO" && estadoCobro !== "RECHAZADO") return false;
  if (!(Number(enc.costo_calculado) > 0)) return false;
  const estado = enc.estado ?? "";
  if (enc.modalidad_pago === "DESTINO") {
    return ["POR_PAGAR", "EN_TRANSITO", "EN_OFICINA_DESTINO"].includes(estado);
  }
  return rol === "remitente" && estado === "POR_PAGAR";
}

/** Encomienda en curso (no entregada, cancelada ni devuelta). */
export function encomiendaEsActiva(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return !["ENTREGADA", "CANCELADA", "DEVUELTA"].includes(estado);
}
