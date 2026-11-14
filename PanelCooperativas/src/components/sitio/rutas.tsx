import Link from "next/link";

import { fechaTasaCorta, formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { formatCiudad, formatDuracion } from "@/lib/ve.generated";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { RUTAS_PANEL } from "@/lib/sitio/urls";

/**
 * Las rutas con más salidas próximas, como la pizarra de un terminal: una palabra que
 * llena la columna y una barra por trayecto que se abre con sus datos reales.
 */
export function Rutas({ rutas, tasa }: { rutas: RutaPopular[]; tasa: TasaRef | null }) {
  return (
    <section id="rutas" className="s-seccion" aria-labelledby="titulo-rutas">
      <div className="s-rutas__columna">
        <h2 id="titulo-rutas" className="s-rutas__palabra" data-revelar>
          Rutas
        </h2>
        <div className="s-rutas__intro">
          <p data-revelar style={{ ["--d" as string]: 1 }}>
            {rutas.length > 0
              ? "Los trayectos con más salidas esta semana. Los precios son la tarifa más baja entre las cooperativas que cubren la ruta."
              : "Las cooperativas están publicando sus rutas y horarios. Aquí verás los trayectos con más salidas y su precio más bajo."}
          </p>
          {tasa && (
            <p className="s-rutas__tasa" data-revelar style={{ ["--d" as string]: 2 }}>
              <strong className="s-num">Bs {formatNumeroVE(tasa.tasa)}</strong>
              por dólar, tasa BCV del {fechaTasaCorta(tasa.fecha)}
            </p>
          )}
        </div>

        {rutas.length > 0 ? (
          <ul className="s-rutas__lista">
            {rutas.map((r, i) => {
              const origen = formatCiudad(r.ciudad_origen);
              const destino = formatCiudad(r.ciudad_destino);
              const duracion = r.duracion_min ? formatDuracion(r.duracion_min) : "";
              return (
                <li key={`${r.ciudad_origen}-${r.ciudad_destino}`} data-revelar style={{ ["--d" as string]: Math.min(i, 6) }}>
                  <details className="s-barra-ruta" open={i === 0}>
                    <summary>
                      <span>
                        {origen}
                        <span className="s-barra-ruta__flecha" aria-hidden>
                          →
                        </span>
                        <span className="sr-only"> a </span>
                        {destino}
                      </span>
                      <span className="s-barra-ruta__desde s-num">
                        <span>desde </span>
                        <strong>${formatNumeroVE(r.desde_usd)}</strong>
                      </span>
                      <span className="s-mas" aria-hidden />
                    </summary>
                    <dl>
                      {duracion && (
                        <div>
                          <dt>Duración aproximada</dt>
                          <dd className="s-num">{duracion}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Cooperativas en la ruta</dt>
                        <dd className="s-num">{r.cooperativas}</dd>
                      </div>
                      <div>
                        <dt>Salidas programadas</dt>
                        <dd className="s-num">{r.salidas_proximas > 0 ? r.salidas_proximas : "Sin salidas por ahora"}</dd>
                      </div>
                      {tasa && (
                        <div>
                          <dt>En bolívares, desde</dt>
                          <dd className="s-num">Bs {formatNumeroVE(usdABs(r.desde_usd, tasa.tasa))}</dd>
                        </div>
                      )}
                    </dl>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="s-rutas__lista">
            <li>
              <details className="s-barra-ruta" open>
                <summary>
                  <span>Primeras rutas en camino</span>
                  <span />
                  <span className="s-mas" aria-hidden />
                </summary>
                <dl>
                  <div>
                    <dt>¿Tienes una cooperativa?</dt>
                    <dd>
                      <Link href={RUTAS_PANEL.registro} className="s-enlace">
                        Publica tus rutas
                      </Link>
                    </dd>
                  </div>
                </dl>
              </details>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
