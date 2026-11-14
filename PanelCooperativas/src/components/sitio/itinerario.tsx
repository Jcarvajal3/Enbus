import Image from "next/image";

import { FOTOS } from "./fotos";

const GRUPOS = [
  {
    titulo: "Antes de viajar",
    filas: [
      ["Busca la ruta y la fecha", "en la app"],
      ["Elige tu asiento en el mapa del bus", "apartado 30 min"],
      ["Paga por Pago Móvil o transferencia", "en Bs, tasa BCV"],
      ["La cooperativa verifica tu pago", "te avisamos"],
    ],
  },
  {
    titulo: "El día del viaje",
    filas: [
      ["Llega a la oficina con tu cédula", "con tiempo"],
      ["Muestra el QR de tu pase", "en el andén"],
    ],
  },
  {
    titulo: "Si cambian los planes",
    filas: [
      ["Cancelas antes de la salida", "te devuelven 95 %"],
      ["La cooperativa cancela el viaje", "te devuelven 100 %"],
    ],
  },
] as const;

/** Cómo se compra un pasaje, impreso como el recibo de un itinerario. */
export function Itinerario() {
  return (
    <section id="como-funciona" className="s-itinerario" aria-labelledby="titulo-itinerario">
      <div className="s-marco s-itinerario__rejilla">
        <div className="s-itinerario__texto">
          <h2 id="titulo-itinerario" className="s-titulo" data-revelar>
            Del teléfono al asiento
          </h2>
          <p data-revelar style={{ ["--d" as string]: 1 }}>
            Compras con la cooperativa de siempre, desde la app. El pago va directo a su cuenta: EnBus no toca tu
            dinero.
          </p>
          <figure className="s-itinerario__foto" data-revelar style={{ ["--d" as string]: 2 }}>
            <div>
              <Image
                src={FOTOS.carreteraLaraZulia}
                alt="Vista desde la ventana de un autobús en la carretera Lara-Zulia, con cerros secos al fondo"
                fill
                sizes="(max-width: 900px) 100vw, 40vw"
                placeholder="blur"
              />
            </div>
            <figcaption className="s-pie-foto">Desde la ventana, carretera Lara-Zulia.</figcaption>
          </figure>
        </div>

        <div className="s-recibo" data-revelar style={{ ["--d" as string]: 1 }}>
          <div className="s-recibo__cabeza">
            <strong>EnBus</strong>
            <span>Itinerario de compra</span>
          </div>
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <h3>{g.titulo}</h3>
              <ul>
                {g.filas.map(([que, cuando]) => (
                  <li key={que}>
                    <span>{que}</span>
                    <span className="s-recibo__puntos" aria-hidden />
                    <span>{cuando}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="s-recibo__total">
            <span>Tu asiento, sin hacer cola</span>
            <span>Pase en el teléfono</span>
          </p>
        </div>
      </div>
    </section>
  );
}
