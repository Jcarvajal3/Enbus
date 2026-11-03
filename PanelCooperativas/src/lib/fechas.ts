// ─── Fechas en hora de Venezuela ─────────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs),
// la misma que usan la app y la landing. Venezuela usa UTC-4 fijo: estos helpers no
// dependen de la zona horaria del servidor ni del navegador. Las fechas de día
// viajan como 'YYYY-MM-DD' y las horas como 'HH:mm'.

export {
  ZONA_VE,
  fechaVE,
  hoyVE,
  fechaHoraVEaISO,
  rangoDiaVE,
  sumarDiasVE,
  formatFechaVE,
  formatHoraVE,
  formatFechaHoraVE,
  formatFechaHoraCortaVE,
  formatDiaVE,
  formatDiaHoraVE,
  capitalizarInicio,
  formatFechaCalendario,
  formatHaceTiempo,
  formatDuracion,
} from "./ve.generated";
