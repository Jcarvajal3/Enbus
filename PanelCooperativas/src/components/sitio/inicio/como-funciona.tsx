import { ArrowCounterClockwise, Bank, CheckCircle, Timer } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { QrPase } from "@/components/sitio/qr-pase";
import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";

import { MapaAsientos } from "./maquetas/mapa-asientos";
import s from "./como-funciona.module.css";

interface Paso {
  titulo: string;
  texto: string;
  maqueta: ReactNode;
}

const PASOS: Paso[] = [
  {
    titulo: "Busca tu ruta y fecha",
    texto: "Dices de dónde sales, a dónde vas y cuándo. Comparas las salidas de varias cooperativas.",
    maqueta: (
      <div className={s.busqueda}>
        <div className={s.campo}>
          <small>Ruta</small>
          <strong>Origen → Destino</strong>
        </div>
        {["7:30 p. m.", "9:00 p. m."].map((hora) => (
          <div key={hora} className={s.salida}>
            <div>
              <strong className="s-num">{hora}</strong>
              <small>Cooperativa verificada</small>
            </div>
            <span className="s-chip s-chip--ok">Hay asientos</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    titulo: "Elige tu asiento",
    texto: "Tocas tu puesto en el mapa del bus. Queda apartado 30 minutos mientras pagas.",
    maqueta: (
      <div className={s.asientos}>
        <span className="s-chip s-chip--sol">
          <Timer weight="bold" aria-hidden />
          Apartado 30 min
        </span>
        <MapaAsientos filas={4} ocupados={[1, 4, 7, 10, 14]} elegido={6} />
      </div>
    ),
  },
  {
    titulo: "Paga en bolívares",
    texto:
      "Ves el monto exacto a la tasa BCV y pagas con Pago Móvil, transferencia, Zelle o en taquilla, según la cooperativa. Ella verifica tu pago y te avisamos.",
    maqueta: (
      <div className={s.pago}>
        <small>Total a pagar</small>
        <strong>Bs, monto exacto</strong>
        <ul>
          {["Pago Móvil", "Transferencia", "Zelle", "Taquilla"].map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <span className="s-chip s-chip--ok">
          <CheckCircle weight="fill" aria-hidden />
          Boleto confirmado
        </span>
      </div>
    ),
  },
  {
    titulo: "Embarca con tu QR y tu cédula",
    texto: "Tu pase de abordar queda en la app. En el andén muestras el código y tu cédula.",
    maqueta: (
      <div className={s.qr}>
        <QrPase valor="enbus-pase-de-muestra" />
        <small>Pase de abordar</small>
      </div>
    ),
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" aria-labelledby="como-titulo" className="s-seccion">
      <div className="s-marco">
        <EncabezadoSeccion
          id="como-titulo"
          etiqueta="Cómo funciona"
          titulo="Del teléfono al asiento en 4 pasos"
          bajada="Sin colas en la terminal y sin llamadas para preguntar si queda un puesto."
        />

        <ol className={s.pasos}>
          {PASOS.map((p, i) => (
            <li key={p.titulo} className={s.paso} data-revelar style={{ ["--d" as string]: i }}>
              <span className={`${s.numero} s-num`} aria-hidden>
                {i + 1}
              </span>
              <div className={s.maqueta} aria-hidden>
                {p.maqueta}
              </div>
              <h3>
                <span className={s.sr}>Paso {i + 1}: </span>
                {p.titulo}
              </h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>

        <aside className={`s-tarjeta ${s.nota}`} data-revelar aria-labelledby="cambio-titulo">
          <span className="s-icono s-icono--coral">
            <ArrowCounterClockwise weight="regular" aria-hidden />
          </span>
          <div className={s.notaTexto}>
            <h3 id="cambio-titulo">¿Cambio de planes?</h3>
            <p>
              Si cancelas antes de la salida, te devuelven el 95 %. Si la cooperativa cancela el viaje, te devuelven el
              100 %. En ambos casos, por el mismo medio con el que pagaste.
            </p>
          </div>
          <div className={s.notaChips}>
            <span className="s-chip s-chip--coral s-num">95 % si cancelas</span>
            <span className="s-chip s-chip--ok s-num">
              <Bank weight="bold" aria-hidden />
              100 % si cancela la cooperativa
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
