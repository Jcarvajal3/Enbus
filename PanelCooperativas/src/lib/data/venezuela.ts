// Estados y ciudades para los selectores de rutas, sucursales y encomiendas.
// La fuente es el catálogo de shared/ve.ts (`ESTADOS_VE`, copiado en ../ve.generated.ts
// por shared/generar.mjs): el mismo que ofrece la app al elegir origen y destino. Para
// añadir una ciudad se edita shared/ve.ts, no este archivo.
//
// `value` es la clave que se guarda en la base (= normalizar_localidad de SQL:
// "socopo", "san_juan", "puerto_la_cruz") y `label`, el nombre legible ("Socopó").

import { ESTADOS_VE } from "@/lib/ve.generated";

export const ESTADOS_VENEZUELA: { value: string; label: string }[] = ESTADOS_VE.map((e) => ({
  value: e.clave,
  label: e.nombre,
}));

export const CIUDADES_POR_ESTADO: Record<string, { value: string; label: string }[]> = Object.fromEntries(
  ESTADOS_VE.map((e) => [e.clave, e.ciudades.map((c) => ({ value: c.clave, label: c.nombre }))])
);
