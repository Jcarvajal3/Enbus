"use client";

import { useMemo, useState } from "react";

import { TarjetaViaje } from "@/components/pasajero/busqueda/tarjeta-viaje";
import type { TasaRef } from "@/lib/dinero.generated";
import type { ViajeResumen } from "@/lib/pasajero/viajes";
import { formatCiudad } from "@/lib/ve.generated";
import { EncabezadoSeccion } from "../ui/encabezado";
import s from "./proximas-salidas.module.css";

const VISIBLES = 6;
const MAX_CHIPS = 7;

/** Las salidas más cercanas de cualquier ruta, con chips para filtrar por ciudad de origen. */
export function ProximasSalidas({ viajes, tasa }: { viajes: ViajeResumen[]; tasa: TasaRef | null }) {
  const [origen, setOrigen] = useState<string | null>(null);

  // Orígenes con más salidas primero.
  const chips = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const v of viajes) cuenta.set(v.origen, (cuenta.get(v.origen) ?? 0) + 1);
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
      .slice(0, MAX_CHIPS)
      .map(([clave]) => clave);
  }, [viajes]);

  const lista = useMemo(
    () => (origen ? viajes.filter((v) => v.origen === origen) : viajes).slice(0, VISIBLES),
    [viajes, origen]
  );

  return (
    <section id="salidas" className={s.seccion} aria-labelledby="titulo-salidas">
      <div className="s-marco">
        <EncabezadoSeccion
          id="titulo-salidas"
          etiqueta="Salidas reales"
          titulo="Próximas salidas"
          bajada="Lo que sale pronto, con asientos libres. Elige una y escoge tu asiento en el mapa del bus."
        />

        {viajes.length === 0 ? (
          <p className={s.vacio}>
            Las cooperativas están publicando sus salidas. Busca arriba tu ruta y fecha, o vuelve en un rato.
          </p>
        ) : (
          <>
            {chips.length > 1 && (
              <div className={s.chips} role="group" aria-label="Filtrar por ciudad de salida">
                <button type="button" className={s.chip} aria-pressed={origen === null} onClick={() => setOrigen(null)}>
                  Todas
                </button>
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={s.chip}
                    aria-pressed={origen === c}
                    onClick={() => setOrigen(origen === c ? null : c)}
                  >
                    Desde {formatCiudad(c)}
                  </button>
                ))}
              </div>
            )}
            <ul className={s.lista} aria-live="polite">
              {lista.map((v) => (
                <li key={v.id}>
                  <TarjetaViaje viaje={v} tasa={tasa} contexto />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
