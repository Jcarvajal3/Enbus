// ─── Días de la semana ───────────────────────────────────────────────────────
// Lo usa la página Horarios. Las salidas recurrentes ya no se programan desde
// Viajes: las crean solas los horarios (Horarios_y_Asignacion_Spec.md).

/** Días de la semana en el orden del formulario. `dow` = getUTCDay() (0 = domingo). */
export const DIAS_SEMANA = [
  { valor: "L", corto: "Lun", nombre: "Lunes", dow: 1 },
  { valor: "M", corto: "Mar", nombre: "Martes", dow: 2 },
  { valor: "Mi", corto: "Mié", nombre: "Miércoles", dow: 3 },
  { valor: "J", corto: "Jue", nombre: "Jueves", dow: 4 },
  { valor: "V", corto: "Vie", nombre: "Viernes", dow: 5 },
  { valor: "S", corto: "Sáb", nombre: "Sábado", dow: 6 },
  { valor: "D", corto: "Dom", nombre: "Domingo", dow: 0 },
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number]["valor"];
