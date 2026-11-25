// Arma el índice de ciudades con ruta a partir de las filas de `rutas` (sin dependencias del servidor).

import { normalizarCiudad } from "@/lib/ve.generated";
import type { CiudadConRuta, RutasEnvio } from "@/components/pasajero/encomienda/tipos";

type Fila = Record<string, unknown>;

function lugar(ciudad: unknown, estado: unknown): CiudadConRuta | null {
  const c = normalizarCiudad(typeof ciudad === "string" ? ciudad : "");
  const e = normalizarCiudad(typeof estado === "string" ? estado : "");
  return c ? { ciudad: c, estado: e } : null;
}

export function rutasEnLimpio(filas: Fila[]): RutasEnvio {
  const origenes = new Map<string, CiudadConRuta>();
  const destinos = new Map<string, Map<string, CiudadConRuta>>();
  for (const f of filas) {
    const o = lugar(f.ciudad_origen, f.estado_origen);
    const d = lugar(f.ciudad_destino, f.estado_destino);
    if (!o || !d || o.ciudad === d.ciudad) continue;
    origenes.set(o.ciudad, o);
    const lista = destinos.get(o.ciudad) ?? new Map<string, CiudadConRuta>();
    lista.set(d.ciudad, d);
    destinos.set(o.ciudad, lista);
  }
  const porNombre = (a: CiudadConRuta, b: CiudadConRuta) => a.ciudad.localeCompare(b.ciudad, "es");
  return {
    origenes: [...origenes.values()].sort(porNombre),
    destinosPorOrigen: Object.fromEntries(
      [...destinos.entries()].map(([o, lista]) => [o, [...lista.values()].sort(porNombre)])
    ),
  };
}
