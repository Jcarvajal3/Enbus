import {
  Armchair,
  ArrowCounterClockwise,
  Bank,
  CurrencyCircleDollar,
  QrCode,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";

import { MapaAsientos } from "./maquetas/mapa-asientos";
import s from "./beneficios.module.css";

type Tono = "cielo" | "sol" | "ok" | "noche" | "coral";

const CLASE_ICONO: Record<Tono, string> = {
  cielo: "s-icono",
  sol: "s-icono s-icono--sol",
  ok: "s-icono s-icono--ok",
  noche: "s-icono s-icono--noche",
  coral: "s-icono s-icono--coral",
};

function Tarjeta({
  clase,
  Icono,
  tono,
  titulo,
  texto,
  retardo,
  children,
}: {
  clase: string;
  Icono: typeof Armchair;
  tono: Tono;
  titulo: string;
  texto: string;
  retardo: number;
  children?: ReactNode;
}) {
  return (
    <article className={`s-tarjeta ${s.tarjeta} ${clase}`} data-revelar style={{ ["--d" as string]: retardo }}>
      <div className={s.cuerpo}>
        <span className={CLASE_ICONO[tono]}>
          <Icono weight="regular" aria-hidden />
        </span>
        <h3>{titulo}</h3>
        <p>{texto}</p>
      </div>
      {children && (
        <div className={s.visual} aria-hidden>
          {children}
        </div>
      )}
    </article>
  );
}

export function Beneficios() {
  return (
    <section id="por-que" aria-labelledby="por-que-titulo" className="s-seccion s-seccion--papel">
      <div className="s-marco">
        <EncabezadoSeccion
          id="por-que-titulo"
          etiqueta="Por qué EnBus"
          titulo="Viajar en bus, ahora con certezas"
          bajada="Sabes qué asiento tienes, cuánto pagas en bolívares y a quién se lo pagas, antes de salir de casa."
        />

        <div className={s.bento}>
          <Tarjeta
            clase={s.asiento}
            Icono={Armchair}
            tono="sol"
            titulo="Elige tu asiento en el mapa"
            texto="Ves el bus completo y escoges tu puesto. Queda apartado 30 minutos mientras pagas, así nadie te lo quita."
            retardo={0}
          >
            <div className={s.mapaCaja}>
              <MapaAsientos filas={4} ocupados={[2, 3, 6, 9, 10, 13]} elegido={11} />
            </div>
          </Tarjeta>

          <Tarjeta
            clase={s.verificadas}
            Icono={SealCheck}
            tono="ok"
            titulo="Cooperativas verificadas"
            texto="Cada cooperativa pasa por una solicitud y una aprobación de EnBus antes de vender un solo pasaje."
            retardo={1}
          />

          <Tarjeta
            clase={s.directo}
            Icono={Bank}
            tono="cielo"
            titulo="Tu dinero va directo a la cooperativa"
            texto="Pagas a la cuenta de la cooperativa: EnBus no toca tu dinero. Ella verifica tu referencia y te avisamos cuando tu boleto queda confirmado."
            retardo={2}
          />

          <Tarjeta
            clase={s.bolivares}
            Icono={CurrencyCircleDollar}
            tono="sol"
            titulo="Pagas en bolívares, a la tasa BCV"
            texto="El precio es una referencia en dólares. Antes de pagar ves el monto exacto en bolívares, a la tasa oficial del día."
            retardo={3}
          >
            <div className={s.cuenta}>
              <span className="s-chip s-chip--sol">Ejemplo ilustrativo</span>
              <dl>
                <div>
                  <dt>Precio de referencia</dt>
                  <dd className="s-num">$ 35,00</dd>
                </div>
                <div>
                  <dt>Tasa BCV del día</dt>
                  <dd>
                    <span className="s-chip s-chip--cielo">Se actualiza cada 30 min</span>
                  </dd>
                </div>
                <div className={s.total}>
                  <dt>Pagas</dt>
                  <dd>Bs, monto exacto</dd>
                </div>
              </dl>
            </div>
          </Tarjeta>

          <Tarjeta
            clase={s.pase}
            Icono={QrCode}
            tono="noche"
            titulo="Tu pase en el teléfono"
            texto="Tu pase de abordar con QR queda en la app. El día del viaje llevas tu cédula y listo."
            retardo={4}
          />

          <Tarjeta
            clase={s.reembolsos}
            Icono={ArrowCounterClockwise}
            tono="coral"
            titulo="Reembolsos claros"
            texto="Si cancelas antes de la salida, te devuelven el 95 %. Si la cooperativa cancela el viaje, el 100 %. Siempre por el mismo medio con el que pagaste."
            retardo={5}
          >
            <div className={s.reembolsoCaja}>
              <div>
                <strong className="s-num">95 %</strong>
                <span>si cancelas tú</span>
              </div>
              <div>
                <strong className="s-num">100 %</strong>
                <span>si cancela la cooperativa</span>
              </div>
            </div>
          </Tarjeta>
        </div>
      </div>
    </section>
  );
}
