// ─── Rutas: qué falta para poder activarlas ──────────────────────────────────
// Una ruta se puede guardar inactiva sin duración ni precio (borrador, p. ej. cargada por el
// equipo mientras la cooperativa aún no sabe cuánto dura el viaje). Para activarla hacen
// falta los dos; la base lo exige para la duración (chk_rutas_activa_completa). Lo usan la
// pantalla Rutas, sus acciones del servidor y la ficha del super admin.

type DatosRuta = { duracion_estimada_min?: unknown; precio_pasaje?: unknown };

/** Qué le falta a una ruta para poder activarse, en texto ("la duración", "el precio"); vacío = completa. */
export function datosFaltantesRuta(ruta: DatosRuta): string[] {
  const faltan: string[] = [];
  if (!(Number(ruta.duracion_estimada_min) > 0)) faltan.push("la duración");
  if (!(Number(ruta.precio_pasaje) > 0)) faltan.push("el precio");
  return faltan;
}

/** true si la ruta ya tiene todo para activarse. */
export function rutaCompleta(ruta: DatosRuta): boolean {
  return datosFaltantesRuta(ruta).length === 0;
}
