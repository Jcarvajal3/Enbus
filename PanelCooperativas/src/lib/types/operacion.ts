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
  /** Desde 20261109000001: bus asignado y copia de su unidad y chofer. */
  bus_id?: string | null;
  numero_unidad?: string | null;
  nombre_chofer?: string | null;
  pasajeros_avisados: number;
};

// ─── Buses (migración 20261109000001) ────────────────────────────────────────
// Cada viaje guarda `bus_id` y una copia (snapshot) de la unidad, el chofer y los
// asientos del bus al programarlo: editar el bus no cambia los viajes ya creados.

/** Fila de `buses`. */
export type Bus = {
  id: string;
  /** Identificador de la unidad ("Unidad 12", "U-045"). Único por cooperativa. */
  numero_unidad: string;
  /** Placa sin separadores ("AB123CD"), o null. */
  placa: string | null;
  /** 1 a 80. */
  asientos: number;
  chofer_nombre: string | null;
  /** "0414-1234567", o null. */
  chofer_telefono: string | null;
  activo: boolean;
  created_at: string;
};

/** Bus activo para el selector de "Programar viaje" y "Editar viaje". */
export type BusParaViaje = Pick<Bus, "id" | "numero_unidad" | "placa" | "asientos" | "chofer_nombre">;

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
