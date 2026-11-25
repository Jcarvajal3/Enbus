import Link from "next/link";
import { ArrowRight, Buildings, Clock, Ticket } from "@phosphor-icons/react/dist/ssr";

import { formatBs, formatNumeroVE, formatUsd, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { urlViajes } from "@/lib/pasajero/rutas";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { formatCiudad, formatDuracion, hoyVE } from "@/lib/ve.generated";
import s from "./tarjeta-ruta.module.css";

/** Una ruta popular: enlaza a la búsqueda de hoy. Sirve en la portada y en /viajes sin ruta. */
export function TarjetaRuta({ ruta, tasa, fecha }: { ruta: RutaPopular; tasa: TasaRef | null; fecha?: string }) {
  const origen = formatCiudad(ruta.ciudad_origen);
  const destino = formatCiudad(ruta.ciudad_destino);
  const duracion = ruta.duracion_min ? formatDuracion(ruta.duracion_min) : "";
  const href = urlViajes({ origen: ruta.ciudad_origen, destino: ruta.ciudad_destino, fecha: fecha ?? hoyVE() });

  return (
    <Link href={href} className={s.tarjeta}>
      <span className={s.trayecto}>
        <span className={s.ciudad}>{origen}</span>
        <span className={s.flecha} aria-hidden>
          <ArrowRight weight="bold" />
        </span>
        <span className="sr-only"> a </span>
        <span className={s.ciudad}>{destino}</span>
      </span>

      <span className={s.precio}>
        <span className={s.desde}>Desde</span>
        {tasa ? (
          <>
            <strong className="s-num">{formatBs(usdABs(ruta.desde_usd, tasa.tasa))}</strong>
            <span className={`${s.usd} s-num`}>≈ {formatUsd(ruta.desde_usd)}</span>
          </>
        ) : (
          <strong className="s-num">${formatNumeroVE(ruta.desde_usd)}</strong>
        )}
      </span>

      <span className={s.datos}>
        {duracion && (
          <span>
            <Clock aria-hidden />
            <span className="s-num">Aprox. {duracion}</span>
          </span>
        )}
        <span>
          <Buildings aria-hidden />
          <span className="s-num">
            {ruta.cooperativas === 1 ? "1 cooperativa" : `${formatNumeroVE(ruta.cooperativas, 0)} cooperativas`}
          </span>
        </span>
        {ruta.salidas_proximas > 0 && (
          <span>
            <Ticket aria-hidden />
            <span className="s-num">
              {ruta.salidas_proximas === 1 ? "1 salida próxima" : `${formatNumeroVE(ruta.salidas_proximas, 0)} salidas próximas`}
            </span>
          </span>
        )}
      </span>

      <span className={s.cta}>
        Ver salidas
        <ArrowRight aria-hidden weight="bold" />
      </span>
    </Link>
  );
}
