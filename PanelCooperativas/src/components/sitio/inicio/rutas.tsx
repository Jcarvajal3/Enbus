import Link from "next/link";
import { ArrowRight, Info, Path, Receipt } from "@phosphor-icons/react/dist/ssr";

import { TarjetaRuta } from "@/components/pasajero/busqueda/tarjeta-ruta";
import { fechaTasaCorta, formatNumeroVE, type TasaRef } from "@/lib/dinero.generated";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { RUTAS_SITIO } from "@/lib/sitio/urls";
import { EncabezadoSeccion } from "../ui/encabezado";
import estilos from "./rutas.module.css";

/** Las rutas con más salidas próximas, con su precio más bajo en $ y Bs. */
export function RutasPopulares({ rutas, tasa }: { rutas: RutaPopular[]; tasa: TasaRef | null }) {
  return (
    <section id="rutas" className="s-seccion s-seccion--papel" aria-labelledby="titulo-rutas">
      <div className="s-marco">
        <div className={estilos.cabecera}>
          <EncabezadoSeccion
            id="titulo-rutas"
            etiqueta="Rutas populares"
            titulo="Las rutas con más salidas"
            bajada="Toca una ruta para ver las salidas de hoy. El precio es el más bajo entre las cooperativas que la cubren."
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
                <TarjetaRuta ruta={r} tasa={tasa} />
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
