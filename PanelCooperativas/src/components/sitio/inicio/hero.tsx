import Image from "next/image";
import {
  Armchair,
  Bank,
  CheckCircle,
  CurrencyCircleDollar,
  MagnifyingGlass,
  Package,
  SealCheck,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

import { FOTOS } from "@/components/sitio/fotos";
import { QrPase } from "@/components/sitio/qr-pase";
import { BotonesTienda } from "@/components/sitio/ui/tiendas";
import { Telefono } from "@/components/sitio/ui/telefono";
import { formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import type { Estadisticas, RutaPopular } from "@/lib/sitio/consultas";
import { formatCiudad } from "@/lib/ve.generated";

import { MapaAsientos } from "./maquetas/mapa-asientos";
import s from "./hero.module.css";

const GARANTIAS = [
  "Pagas directo a la cooperativa",
  "Reembolso del 95 % si cancelas",
  "Pase QR en tu teléfono",
];

const PILARES = [
  { Icono: ShieldCheck, texto: "Cooperativas verificadas por EnBus" },
  { Icono: Bank, texto: "Pago Móvil, transferencia, Zelle o taquilla" },
  { Icono: CurrencyCircleDollar, texto: "Tasa oficial BCV del día" },
  { Icono: Package, texto: "Encomiendas con rastreo" },
];

function cifraValida(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function Hero({ ruta, tasa, stats }: { ruta: RutaPopular | null; tasa: TasaRef | null; stats: Estadisticas | null }) {
  const origen = ruta ? formatCiudad(ruta.ciudad_origen) : "";
  const destino = ruta ? formatCiudad(ruta.ciudad_destino) : "";
  const rutaReal = Boolean(origen && destino);
  const desde = ruta && cifraValida(ruta.desde_usd) ? ruta.desde_usd : null;
  const tasaOk = tasa && cifraValida(tasa.tasa) ? tasa.tasa : null;

  const mostrarCifras =
    !!stats && stats.cooperativas >= 3 && stats.rutas >= 5 && stats.ciudades >= 2;

  return (
    <section id="inicio" aria-labelledby="hero-titulo" className={s.hero}>
      <div className={`s-marco ${s.rejilla}`}>
        <div className={s.texto}>
          <span className="s-chip s-chip--cielo">Pasajes y encomiendas en toda Venezuela</span>
          <h1 id="hero-titulo" className={`s-titulo-1 ${s.titulo}`}>
            Tu pasaje de bus, sin colas y con tu asiento asegurado
          </h1>
          <p className={`s-bajada ${s.bajada}`}>
            Compras desde el teléfono con cooperativas verificadas, eliges tu asiento, pagas en bolívares a la tasa BCV y
            embarcas con tu pase QR.
          </p>
          <div className={s.acciones}>
            <BotonesTienda />
            <a href="#rastrear" className="s-boton s-boton--claro">
              <MagnifyingGlass aria-hidden />
              Rastrear un envío
            </a>
          </div>
          <ul className={s.garantias}>
            {GARANTIAS.map((g) => (
              <li key={g}>
                <CheckCircle weight="fill" aria-hidden />
                {g}
              </li>
            ))}
          </ul>
        </div>

        <div className={s.visual}>
          <div className={s.panel} aria-hidden>
            <Image
              src={FOTOS.llanosApure}
              alt=""
              fill
              priority
              placeholder="blur"
              sizes="(min-width: 1024px) 40vw, 90vw"
              className={s.foto}
            />
            <div className={s.velo} />
          </div>

          <div className={s.telefono}>
            <Telefono
              ancho={276}
              etiqueta={`Maqueta de la app de EnBus: pase de abordar con código QR${rutaReal ? `, de ${origen} a ${destino}` : ""}`}
            >
              <div className={s.pantalla}>
                <div className={s.pantallaCab}>
                  <span className={s.pantallaTitulo}>Tu pase de abordar</span>
                  <span className="s-chip s-chip--ok">
                    <SealCheck weight="fill" aria-hidden />
                    Pago verificado
                  </span>
                </div>
                <div className={s.pase}>
                  <div className={s.trayecto}>
                    <div>
                      <small>Origen</small>
                      <strong>{rutaReal ? origen : "Caracas"}</strong>
                    </div>
                    <span className={s.flecha} />
                    <div className={s.destino}>
                      <small>Destino</small>
                      <strong>{rutaReal ? destino : "Mérida"}</strong>
                    </div>
                  </div>
                  <dl className={s.datos}>
                    <div>
                      <dt>Salida</dt>
                      <dd>Mañana · 8:00 p. m.</dd>
                    </div>
                    <div>
                      <dt>Asiento</dt>
                      <dd>14</dd>
                    </div>
                    <div className={s.ancho}>
                      <dt>Cooperativa</dt>
                      <dd>Cooperativa verificada</dd>
                    </div>
                  </dl>
                  <div className={s.corte} />
                  <div className={s.qr}>
                    <QrPase valor="enbus-pase-de-muestra" />
                    <p>Muestra este código y tu cédula en el andén</p>
                  </div>
                </div>
              </div>
            </Telefono>
          </div>

          <div className={`${s.flota} ${s.flotaAsiento}`} aria-hidden>
            <div className={s.flotaCab}>
              <Armchair weight="fill" />
              <div>
                <strong>Asiento 14</strong>
                <span>Apartado por 30 min</span>
              </div>
            </div>
            <MapaAsientos filas={3} ocupados={[2, 5, 6, 9]} elegido={11} compacto />
          </div>

          <div className={`${s.flota} ${s.flotaPrecio}`} aria-hidden>
            {desde !== null && tasaOk !== null ? (
              <>
                <span className={s.flotaEtiqueta}>
                  {rutaReal ? `${origen} → ${destino}` : "Pasaje"} · desde
                </span>
                <strong className={`${s.precio} s-num`}>$ {formatNumeroVE(desde)}</strong>
                <span className={`${s.precioBs} s-num`}>Bs {formatNumeroVE(usdABs(desde, tasaOk))}</span>
                <span className="s-chip s-chip--sol">A tasa BCV del día</span>
              </>
            ) : (
              <>
                <span className="s-chip s-chip--sol">Tasa BCV</span>
                <strong className={s.precioTexto}>Pagas en Bs a la tasa BCV del día</strong>
                <span className={s.flotaEtiqueta}>Ves el monto exacto antes de pagar</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`s-marco ${s.confianza}`}>
        {mostrarCifras && stats ? (
          <dl className={s.cifras}>
            <div>
              <dd className="s-num">{formatNumeroVE(stats.cooperativas, 0)}</dd>
              <dt>Cooperativas verificadas</dt>
            </div>
            <div>
              <dd className="s-num">{formatNumeroVE(stats.ciudades, 0)}</dd>
              <dt>Ciudades conectadas</dt>
            </div>
            <div>
              <dd className="s-num">{formatNumeroVE(stats.rutas, 0)}</dd>
              <dt>Rutas activas</dt>
            </div>
          </dl>
        ) : (
          <ul className={s.pilares}>
            {PILARES.map(({ Icono, texto }) => (
              <li key={texto}>
                <Icono weight="regular" aria-hidden />
                {texto}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
