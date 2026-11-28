import Link from "next/link";

import { formatBs, formatUsd, usdABs, type TasaRef } from "@/lib/dinero.generated";
import type { DiaConSalidas } from "@/lib/pasajero/viajes";
import { formatDiaVE, hoyVE, sumarDiasVE } from "@/lib/ve.generated";
import { ListaFechas } from "./lista-fechas";
import { textoSalidas, urlBusqueda, type ParametrosBusqueda } from "./utilidades";
import s from "./tira-fechas.module.css";

/** Cuántos días muestra la tira (el elegido queda en el centro cuando se puede). */
export const DIAS_TIRA = 7;

/** Primer día de la tira para `fecha`: tres días antes, sin bajar de hoy. */
export function inicioTira(fecha: string): string {
  const hoy = hoyVE();
  const inicio = sumarDiasVE(fecha, -Math.floor(DIAS_TIRA / 2));
  return inicio < hoy ? hoy : inicio;
}

/** Tira de fechas ±3 días con el nº de salidas y el precio mínimo de cada día; cada una es un enlace. */
export function TiraFechas({
  busqueda,
  dias,
  tasa,
}: {
  busqueda: ParametrosBusqueda;
  dias: readonly DiaConSalidas[];
  tasa: TasaRef | null;
}) {
  const inicio = inicioTira(busqueda.fecha);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const fechas = Array.from({ length: DIAS_TIRA }, (_, i) => sumarDiasVE(inicio, i));
  const hoy = hoyVE();

  return (
    <nav aria-label="Fechas cercanas" className={s.tira}>
      <ListaFechas className={s.lista} fecha={busqueda.fecha}>
        {fechas.map((f) => {
          const d = porFecha.get(f);
          const actual = f === busqueda.fecha;
          const bs = d && tasa ? usdABs(d.precioMinUsd, tasa.tasa) : null;
          const partes = formatDiaVE(f).split(" ");
          return (
            <li key={f} className={s.item}>
              <Link
                href={urlBusqueda({ ...busqueda, fecha: f })}
                className={s.dia}
                aria-current={actual ? "date" : undefined}
                data-vacio={d ? undefined : "true"}
                scroll={false}
              >
                <span className={`${s.nombre} s-num`}>
                  {f === hoy ? "Hoy" : partes[0]} {partes[1]}
                  <span className="sr-only"> {partes.slice(2).join(" ")}</span>
                </span>
                {d ? (
                  <span className={`${s.precio} s-num`}>
                    <span className="sr-only">Desde </span>
                    {bs !== null ? formatBs(bs) : formatUsd(d.precioMinUsd)}
                    <span className="sr-only">, {textoSalidas(d.salidas)}</span>
                  </span>
                ) : (
                  <span className={s.salidas}>
                    <span aria-hidden>—</span>
                    <span className="sr-only">Sin salidas</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ListaFechas>
    </nav>
  );
}
