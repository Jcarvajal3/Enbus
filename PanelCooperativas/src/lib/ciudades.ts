// ─── Nombres de ciudades legibles ────────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs).
// Las rutas y encomiendas antiguas guardan la ciudad como clave ("puerto_la_cruz")
// o en mayúsculas. Todo lo que se muestra en el panel pasa por aquí para que se lea
// igual que en la app ("Mérida", "San Juan de los Morros"), en tablas, diálogos y
// guías impresas.
//
//   formatCiudad("puerto_la_cruz")          → "Puerto La Cruz"
//   formatRuta("merida → valencia")         → "Mérida → Valencia"
//   normalizarCiudad("San Juan de los Morros") → "san_juan"   (= normalizar_localidad de SQL)
//   mismaCiudad("San_Cristóbal", "SAN CRISTOBAL") → true

export { formatCiudad, formatRuta, normalizarCiudad, mismaCiudad } from "./ve.generated";
