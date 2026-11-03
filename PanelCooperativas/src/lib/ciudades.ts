// ─── Nombres de ciudades legibles ────────────────────────────────────────────
// Las rutas y encomiendas antiguas guardan la ciudad como clave
// ("puerto_la_cruz") o en mayúsculas. Todo lo que se muestra en el panel pasa
// por aquí para que se lea igual en tablas, diálogos y guías impresas.

/** "puerto_la_cruz" / "PUERTO LA CRUZ" → "Puerto La Cruz" */
export function formatCiudad(valor: string | null | undefined): string {
  return (valor ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/** "puerto_la_cruz → valencia" → "Puerto La Cruz → Valencia" */
export function formatRuta(ruta: string | null | undefined): string {
  if (!ruta) return "";
  return ruta
    .split("→")
    .map((parte) => formatCiudad(parte))
    .join(" → ");
}
