import Image from "next/image";

import { formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { formatCiudad } from "@/lib/ve.generated";
import type { RutaPopular } from "@/lib/sitio/consultas";
import { FOTOS } from "./fotos";
import { QrPase } from "./qr-pase";

/** Pase de muestra cuando todavía no hay rutas publicadas. */
const MUESTRA = { origen: "Caracas", destino: "Mérida", desdeUsd: null as number | null };

/**
 * La portada es el pase de abordar de EnBus: el título va impreso en el boleto, que
 * descansa sobre los llanos y sigue por debajo del primer pantallazo hasta el talón.
 * El trayecto y el "desde" son los de la ruta con más salidas, si la hay.
 */
export function PasePortada({ ruta, tasa }: { ruta: RutaPopular | null; tasa: TasaRef | null }) {
  const origen = ruta ? formatCiudad(ruta.ciudad_origen) : MUESTRA.origen;
  const destino = ruta ? formatCiudad(ruta.ciudad_destino) : MUESTRA.destino;
  const desdeUsd = ruta?.desde_usd ?? MUESTRA.desdeUsd;

  return (
    <section className="s-portada" aria-labelledby="titulo-portada">
      <div className="s-portada__foto">
        <Image
          src={FOTOS.llanosApure}
          alt="Carretera de tierra que cruza los llanos de Apure bajo un cielo con nubes"
          fill
          priority
          sizes="100vw"
          placeholder="blur"
        />
      </div>

      <article className="s-pase" aria-label="Pase de abordar de EnBus">
        <div className="s-pase__cuerpo">
          <div className="s-pase__cabeza" aria-hidden>
            <strong>EnBus</strong>
          </div>
          <h1 id="titulo-portada">
            <span className="s-pase__h1-linea">Boletos de bus</span>
            <span className="s-pase__h1-linea">y encomiendas</span>
          </h1>
          <p className="s-pase__lema">
            Compra tu pasaje, elige tu asiento y envía paquetes con cooperativas verificadas de toda Venezuela. Pagas
            en bolívares a la tasa BCV del día.
          </p>
          <dl className="s-pase__datos">
            <div>
              <dt>Sale de</dt>
              <dd>{origen}</dd>
            </div>
            <div>
              <dt>Llega a</dt>
              <dd>{destino}</dd>
            </div>
            <div>
              <dt>Salida</dt>
              <dd className="s-num">8:30 p. m.</dd>
            </div>
            <div>
              <dt>Asiento</dt>
              <dd className="s-num">14</dd>
            </div>
          </dl>
        </div>

        <div className="s-pase__talon">
          <div className="s-pase__qr">
            <QrPase valor="PASS-BOL-7CABE4AD" />
          </div>
          <div>
            <p className="s-pase__codigo s-num">BOL-7CAB-E4AD</p>
            <p className="s-pase__nota">
              Así llega tu pase a la app. En el andén muestras este QR y tu cédula, y subes al bus.
            </p>
          </div>
          {desdeUsd !== null ? (
            <div className="s-pase__precio">
              <strong className="s-num">${formatNumeroVE(desdeUsd)}</strong>
              <p className="s-num">
                pasaje más bajo de la ruta
                {tasa ? `, Bs ${formatNumeroVE(usdABs(desdeUsd, tasa.tasa))}` : ""}
              </p>
            </div>
          ) : (
            <div className="s-pase__precio">
              <strong>Bs</strong>
              <p>a la tasa BCV, por Pago Móvil, transferencia o en taquilla</p>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
