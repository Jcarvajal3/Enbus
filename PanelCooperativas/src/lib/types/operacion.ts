// ─── Operación de la cooperativa (fase 4, migración 20260721000002) ──────────
// Respuestas de fn_bandeja_cooperativa, fn_editar_viaje, fn_completar_viaje y
// fn_consumir_limite (Audits/fase4_spec.md §3.2).

/** `proxima_salida` de `fn_bandeja_cooperativa()`. */
export type ProximaSalida = {
  viaje_id: string;
  ciudad_origen: string;
  ciudad_destino: string;
  /** ISO de la salida. */
  salida: string;
  /** Negativo si salió hace poco (hasta 30 min). */
  minutos_para_salir: number;
  boletos_vendidos: number;
  asientos_disponibles: number;
  encomiendas_por_despachar: number;
};

/** Respuesta de `fn_bandeja_cooperativa()`: conteos de "Requiere tu atención". */
export type BandejaCooperativa = {
  pagos_por_verificar: number;
  reembolsos_por_devolver: number;
  reembolsos_usd: number;
  /** En oficina de destino con 3 o más días hábiles. */
  encomiendas_por_vencer: number;
  /** Días hábiles que le quedan a la primera antes de volver al remitente (0 = hoy). */
  dias_minimos_para_devolucion: number;
  encomiendas_por_despachar: number;
  encomiendas_en_camino: number;
  proxima_salida: ProximaSalida | null;
  generado_at: string;
};

/** Respuesta de `fn_editar_viaje(...)`. */
export type ResultadoEditarViaje = {
  viaje_id: string;
  salida: string;
  llegada_estimada: string;
  asientos_totales: number;
  asientos_disponibles: number;
  pasajeros_avisados: number;
};

/** Respuesta de `fn_completar_viaje(p_viaje_id)`. */
export type ResultadoCompletarViaje = {
  estado: "COMPLETADO";
  no_embarcados?: number;
  ya_procesado?: boolean;
};

/** Respuesta de `fn_consumir_limite(...)` (solo service role). */
export type ResultadoLimite = {
  permitido: boolean;
  restantes: number;
  reintentar_en_segundos: number;
};
