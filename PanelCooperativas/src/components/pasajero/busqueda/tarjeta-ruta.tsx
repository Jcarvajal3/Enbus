import Link from "next/link";
import { ArrowRight, CaretRight } from "@phosphor-icons/react/dist/ssr";

import { formatBs, formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { urlViajes } from "@/lib/pasajero/rutas";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { formatCiudad, formatDuracion, hoyVE } from "@/lib/ve.generated";
import s from "./tarjeta-ruta.module.css";

/**
 * Una ruta popular, en una fila compacta: trayecto, duración y precio desde. Enlaza a la búsqueda
 * de hoy. Sirve en la portada y en /viajes sin ruta.
 */
export function TarjetaRuta({ ruta, tasa, fecha }: { ruta: RutaPopular; tasa: TasaRef | null; fecha?: string }) {
  const origen = formatCiudad(ruta.ciudad_origen);
  const destino = formatCiudad(ruta.ciudad_destino);
  const duracion = ruta.duracion_min ? formatDuracion(ruta.duracion_min) : "";
  const href = urlViajes({ origen: ruta.ciudad_origen, destino: ruta.ciudad_destino, fecha: fecha ?? hoyVE() });
  const meta = [
    duracion && `Aprox. ${duracion}`,
    ruta.cooperativas === 1 ? "1 cooperativa" : `${formatNumeroVE(ruta.cooperativas, 0)} cooperativas`,
  ].filter(Boolean);

  return (
    <Link href={href} className={s.tarjeta}>
      <span className={s.texto}>
        <span className={s.trayecto}>
          {origen}
          <ArrowRight aria-hidden weight="bold" className={s.flecha} />
          <span className="sr-only"> a </span>
          {destino}
        </span>
        <span className={`${s.meta} s-num`}>{meta.join(" · ")}</span>
      </span>

      <span className={s.precio}>
        <span className={s.desde}>desde</span>
        <strong className="s-num">
          {tasa ? formatBs(usdABs(ruta.desde_usd, tasa.tasa)) : `$${formatNumeroVE(ruta.desde_usd)}`}
        </strong>
      </span>
      <CaretRight aria-hidden weight="bold" className={s.ir} />
    </Link>
  );
}
