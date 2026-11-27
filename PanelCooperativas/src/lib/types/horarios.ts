// ─── Horarios fijos y días no laborables ─────────────────────────────────────
// Specs/03_Web_Panel_Cooperativas/Horarios_y_Asignacion_Spec.md. Las tablas se leen
// con select (RLS por cooperativa) y se escriben solo por RPC.

/** Fila de `horarios`. `dias`: 0 = domingo … 6 = sábado. */
export type Horario = {
  id: string;
  cooperativa_id: string;
  ruta_id: string;
  /** 'HH:MM:SS' en hora de Venezuela. */
  hora_salida: string;
  dias: number[];
  capacidad: number;
  /** 'YYYY-MM-DD'. */
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

/** Fila de `dias_no_laborables`. Con `cada_anio` solo importan el mes y el día. */
export type DiaNoLaborable = {
  id: string;
  cooperativa_id: string;
  /** 'YYYY-MM-DD'. */
  fecha: string;
  nombre: string | null;
  cada_anio: boolean;
  created_at: string;
};

/** Salida con pasajeros que el sistema no tocó y que el administrador debe cancelar a mano. */
export type SalidaConservada = {
  viaje_id: string;
  /** ISO de la salida. */
  fecha_hora_salida: string;
  ocupados: number;
};

/** Respuesta de `fn_guardar_horario` y `fn_cambiar_estado_horario`. */
export type ResultadoHorario = {
  id: string;
  creadas: number;
  quitadas: number;
  /** Salidas sin movimiento que pasaron a la hora nueva conservando su unidad. */
  movidas: number;
  /** De las movidas, las que perdieron la unidad porque el bus chocaba con otro viaje. */
  sin_unidad_por_choque: number;
  conservadas: SalidaConservada[];
  /** Último día con salidas generadas ('YYYY-MM-DD'). */
  hasta: string | null;
};

/** Respuesta de `fn_guardar_dia_no_laborable`. */
export type ResultadoDiaNoLaborable = {
  id: string;
  quitadas: number;
  conservadas: SalidaConservada[];
};
