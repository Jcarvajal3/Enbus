import Link from "next/link";
import { ArrowRight, Buildings, Clock, Info, Path, Receipt, Ticket } from "@phosphor-icons/react/dist/ssr";

import { fechaTasaCorta, formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { formatCiudad, formatDuracion } from "@/lib/ve.generated";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { RUTAS_SITIO } from "@/lib/sitio/urls";
import { EncabezadoSeccion } from "../ui/encabezado";
import estilos from "./rutas.module.css";

function textoCooperativas(n: number): string {
  return n === 1 ? "1 cooperativa" : `${formatNumeroVE(n, 0)} cooperativas`;
}

function textoSalidas(n: number): string {
  return n === 1 ? "1 salida próxima" : `${formatNumeroVE(n, 0)} salidas próximas`;
}

function Tarjeta({ r, tasa }: { r: RutaPopular; tasa: TasaRef | null }) {
  const origen = formatCiudad(r.ciudad_origen);
  const destino = formatCiudad(r.ciudad_destino);
  const duracion = r.duracion_min ? formatDuracion(r.duracion_min) : "";

  return (
    <article className={estilos.tarjeta}>
      <h3 className={estilos.trayecto}>
        <span className={estilos.ciudad}>{origen}</span>
        <span className={estilos.linea} aria-hidden>
          <Path size={20} />
        </span>
        <span className="sr-only"> a </span>
        <span className={estilos.ciudad}>{destino}</span>
      </h3>

      <p className={estilos.precio}>
        <span className={estilos.desde}>Desde</span>
        <strong className={`${estilos.usd} s-num`}>${formatNumeroVE(r.desde_usd)}</strong>
        {tasa && <span className={`${estilos.bs} s-num`}>Bs {formatNumeroVE(usdABs(r.desde_usd, tasa.tasa))}</span>}
      </p>

      <ul className={estilos.datos}>
        {duracion && (
          <li>
            <Clock size={20} aria-hidden />
            <span className="s-num">Aprox. {duracion}</span>
          </li>
        )}
        <li>
          <Buildings size={20} aria-hidden />
          <span className="s-num">{textoCooperativas(r.cooperativas)}</span>
        </li>
        <li>
          <Ticket size={20} aria-hidden />
          {r.salidas_proximas > 0 ? (
            <span className="s-num">{textoSalidas(r.salidas_proximas)}</span>
          ) : (
            <span className={estilos.sinSalidas}>Sin salidas por ahora</span>
          )}
        </li>
      </ul>
    </article>
  );
}

/** Las rutas con más salidas próximas, con su precio más bajo en $ y Bs. */
export function RutasPopulares({ rutas, tasa }: { rutas: RutaPopular[]; tasa: TasaRef | null }) {
  return (
    <section id="rutas" className="s-seccion s-seccion--papel" aria-labelledby="titulo-rutas">
      <div className="s-marco">
        <div className={estilos.cabecera}>
          <EncabezadoSeccion
            id="titulo-rutas"
            etiqueta="Rutas populares"
            titulo="Las rutas con más salidas esta semana"
            bajada="El precio de cada ruta es el más bajo entre las cooperativas que la cubren."
          />
          {tasa && (
            <p className={estilos.tasa} data-revelar>
              <Receipt size={22} aria-hidden />
              <span>
                Tasa BCV del {fechaTasaCorta(tasa.fecha)}:{" "}
                <strong className="s-num">Bs {formatNumeroVE(tasa.tasa)}</strong> por dólar
              </span>
            </p>
          )}
        </div>

        {rutas.length > 0 ? (
          <ul className={estilos.lista}>
            {rutas.slice(0, 9).map((r, i) => (
              <li key={`${r.ciudad_origen}-${r.ciudad_destino}`} data-revelar style={{ ["--d" as string]: i % 3 }}>
                <Tarjeta r={r} tasa={tasa} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={estilos.vacio} data-revelar>
            <span className="s-icono s-icono--sol" aria-hidden>
              <Path />
            </span>
            <div>
              <h3>Las cooperativas están publicando sus rutas</h3>
              <p>
                Aquí verás los trayectos con más salidas y su precio más bajo, en dólares y en bolívares, en cuanto
                estén disponibles.
              </p>
              <Link href={RUTAS_SITIO.cooperativas} className={`s-enlace-flecha ${estilos.enlace}`}>
                ¿Tienes una cooperativa? Publica tus rutas
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        )}

        <p className={estilos.nota}>
          <Info size={18} aria-hidden />
          <span>
            Los precios son una referencia en dólares. Pagas en bolívares a la tasa oficial del BCV del día en que
            pagas, y ves el monto exacto antes de confirmar.
          </span>
        </p>
      </div>
    </section>
  );
}
