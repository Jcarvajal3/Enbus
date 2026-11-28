import Link from "next/link";
import { ArrowRight, Star } from "@phosphor-icons/react/dist/ssr";

import { formatBs, formatNumeroVE, formatUsd, usdABs, type TasaRef } from "@/lib/dinero.generated";
import type { ViajeResumen } from "@/lib/pasajero/viajes";
import { urlComprarBoleto } from "@/lib/pasajero/rutas";
import { formatCiudad, formatDiaVE, formatDuracion, formatHoraVE } from "@/lib/ve.generated";
import { POCOS_ASIENTOS } from "./utilidades";
import s from "./tarjeta-viaje.module.css";

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "EB"
  );
}

/**
 * Una salida: horas y duración, terminales, cooperativa, asientos y precio. Sin estado, sirve
 * en servidor y en cliente. Con `contexto`, encabeza la tarjeta con ruta y día (portada).
 */
export function TarjetaViaje({
  viaje,
  tasa,
  contexto = false,
}: {
  viaje: ViajeResumen;
  tasa: TasaRef | null;
  contexto?: boolean;
}) {
  const v = viaje;
  const origen = formatCiudad(v.origen);
  const destino = formatCiudad(v.destino);
  const horaSalida = formatHoraVE(v.salida);
  const horaLlegada = v.llegada ? formatHoraVE(v.llegada) : "";
  const duracion = v.duracionMin > 0 ? formatDuracion(v.duracionMin) : "";
  const pocos = v.asientosDisponibles > 0 && v.asientosDisponibles <= POCOS_ASIENTOS;
  const bs = tasa ? usdABs(v.precioUsd, tasa.tasa) : null;
  const etiqueta = `Sale ${contexto ? `de ${origen} a ${destino} ` : ""}a las ${horaSalida}${
    horaLlegada ? `, llega a las ${horaLlegada}${v.diasLlegada === 1 ? " del día siguiente" : v.diasLlegada > 1 ? `, ${v.diasLlegada} días después` : ""}` : ""
  }, con ${v.cooperativa.nombre}`;

  return (
    <article className={s.tarjeta} aria-label={etiqueta}>
      <div className={s.rejilla}>
      <div className={s.principal}>
        {contexto && (
          <p className={s.contexto}>
            <span className={s.ruta}>
              {origen} <span aria-hidden>→</span>
              <span className="sr-only"> a </span> {destino}
            </span>
            <span className={`${s.dia} s-num`}>{formatDiaVE(v.salida)}</span>
          </p>
        )}

        <div className={s.tiempos}>
          <div className={s.momento}>
            <strong className={`${s.hora} s-num`}>{horaSalida}</strong>
            <span className={s.lugar}>{contexto ? origen : (v.terminalOrigen ?? origen)}</span>
          </div>
          <div className={s.trazo} aria-hidden>
            {duracion && <span className="s-num">{duracion}</span>}
          </div>
          <div className={`${s.momento} ${s.momentoLlegada}`}>
            <strong className={`${s.hora} s-num`}>
              {horaLlegada || "—"}
              {v.diasLlegada > 0 && (
                <sup className={s.masDia}>
                  <span aria-hidden>+{v.diasLlegada}</span>
                  <span className="sr-only">
                    {v.diasLlegada === 1 ? " al día siguiente" : ` ${v.diasLlegada} días después`}
                  </span>
                </sup>
              )}
            </strong>
            <span className={s.lugar}>{contexto ? destino : (v.terminalDestino ?? destino)}</span>
          </div>
        </div>
        {duracion && <p className="sr-only">Duración {duracion}</p>}
      </div>

      <div className={s.coop}>
        {v.cooperativa.logoUrl ? (
          // Logos de cooperativas en almacenamiento externo: sin optimizador de Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.cooperativa.logoUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className={s.logo} />
        ) : (
          <span className={s.logoInicial} aria-hidden>
            {iniciales(v.cooperativa.nombre)}
          </span>
        )}
        <div className={s.coopTexto}>
          <p className={s.coopNombre}>{v.cooperativa.nombre}</p>
          <p className={s.coopMeta}>
            {v.cooperativa.calificacion > 0 && (
              <span className={s.calificacion}>
                <Star weight="fill" aria-hidden />
                <span className="s-num">{formatNumeroVE(v.cooperativa.calificacion, 1)}</span>
                <span className="sr-only"> de 5</span>
              </span>
            )}
            {pocos ? (
              <span className="s-chip s-chip--coral">
                {v.asientosDisponibles === 1 ? "Queda 1" : `Quedan ${v.asientosDisponibles}`}
              </span>
            ) : (
              <span className={s.asientos}>{v.asientosDisponibles} asientos libres</span>
            )}
          </p>
        </div>
      </div>

      <div className={s.compra}>
        <p className={`${s.precio} s-num`}>
          {bs !== null ? (
            <>
              <strong>{formatBs(bs)}</strong>
              <span>≈ {formatUsd(v.precioUsd)}</span>
            </>
          ) : (
            <>
              <strong>{formatUsd(v.precioUsd)}</strong>
              <span>En Bs a la tasa BCV</span>
            </>
          )}
        </p>
        <Link href={urlComprarBoleto(v.id)} prefetch={false} className="s-boton s-boton--tinta s-boton--sm">
          Elegir asiento
          <span className="sr-only">
            {" "}
            de las {horaSalida} con {v.cooperativa.nombre}
          </span>
          <ArrowRight aria-hidden weight="bold" />
        </Link>
      </div>
      </div>
    </article>
  );
}
