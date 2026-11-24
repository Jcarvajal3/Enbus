import Link from "next/link";
import { ArrowRight, CalendarBlank, CheckCircle, MapPin, QrCode, Ticket } from "@phosphor-icons/react/dist/ssr";

import { RUTAS_SITIO } from "@/lib/sitio/urls";
import { BotonesTienda } from "../ui/tiendas";
import { Telefono } from "../ui/telefono";
import estilos from "./descarga.module.css";

const PUNTOS = [
  "Elige tu asiento en el mapa del bus",
  "Paga en bolívares a la tasa BCV del día",
  "Tu pase con QR y el rastreo de tus envíos, en un solo lugar",
] as const;

/** Maqueta sencilla del inicio de la app. Decorativa (la oculta <Telefono />). */
function PantallaInicio() {
  return (
    <div className={estilos.app}>
      <div className={estilos.appCabeza}>
        <p className={estilos.appHola}>Hola</p>
        <p className={estilos.appTitulo}>¿A dónde viajas?</p>
      </div>

      <div className={estilos.appBuscador}>
        <div className={estilos.campo}>
          <MapPin weight="regular" aria-hidden />
          <span>
            <small>Origen</small>
            <strong>Caracas</strong>
          </span>
        </div>
        <div className={estilos.campo}>
          <MapPin weight="regular" aria-hidden />
          <span>
            <small>Destino</small>
            <strong>Mérida</strong>
          </span>
        </div>
        <div className={estilos.campo}>
          <CalendarBlank weight="regular" aria-hidden />
          <span>
            <small>Fecha</small>
            <strong>Mañana</strong>
          </span>
        </div>
        <span className={estilos.appBoton}>Buscar salidas</span>
      </div>

      <p className={estilos.appRotulo}>Próximo viaje</p>
      <div className={estilos.viaje}>
        <span className={estilos.viajeIcono}>
          <Ticket weight="regular" aria-hidden />
        </span>
        <span className={estilos.viajeTexto}>
          <strong>Caracas a Mérida</strong>
          <small>Asiento 14 · Confirmado</small>
        </span>
        <QrCode weight="regular" className={estilos.viajeQr} aria-hidden />
      </div>
    </div>
  );
}

/** Cierre de la portada: descarga de la app y puerta hacia /cooperativas. */
export function Descarga() {
  return (
    <section id="descargar" className={`s-seccion s-seccion--noche ${estilos.seccion}`} aria-labelledby="titulo-descarga">
      <div className="s-marco">
        <div className={estilos.panel}>
          <div className={estilos.texto} data-revelar>
            <p className={estilos.etiqueta}>La app de EnBus</p>
            <h2 id="titulo-descarga">Lleva tu viaje en el bolsillo</h2>
            <p className={estilos.bajada}>Tus compras, tus pases y tus envíos, en un solo lugar.</p>
            <ul className={estilos.puntos}>
              {PUNTOS.map((p) => (
                <li key={p}>
                  <CheckCircle weight="fill" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <BotonesTienda tono="noche" />
          </div>

          <div className={estilos.escena} aria-hidden>
            <div className={estilos.telefono}>
              <Telefono ancho={290}>
                <PantallaInicio />
              </Telefono>
            </div>
          </div>
        </div>

        <aside className={estilos.coop} aria-labelledby="titulo-coop" data-revelar>
          <div>
            <h3 id="titulo-coop">¿Tienes una cooperativa de transporte?</h3>
            <p>Vende pasajes y encomiendas desde taquilla y app, con tus propias cuentas de pago.</p>
          </div>
          <Link href={RUTAS_SITIO.cooperativas} className="s-boton s-boton--fantasma">
            Conoce EnBus para cooperativas
            <ArrowRight weight="bold" aria-hidden />
          </Link>
        </aside>
      </div>
    </section>
  );
}
