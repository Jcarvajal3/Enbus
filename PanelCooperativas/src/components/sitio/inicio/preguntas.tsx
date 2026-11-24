import Link from "next/link";
import { EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { correoSoporte, RUTAS_LEGALES, soporteWhatsApp, tiendasApp } from "@/lib/sitio/urls";
import { EncabezadoSeccion } from "../ui/encabezado";
import estilos from "./preguntas.module.css";

interface Pregunta {
  pregunta: string;
  /** Texto plano de la respuesta (también alimenta el JSON-LD). */
  parrafos: string[];
  /** Si existe, reemplaza a `parrafos` en pantalla (con enlaces). */
  contenido?: ReactNode;
}

interface Grupo {
  id: string;
  titulo: string;
  preguntas: Pregunta[];
}

function grupos(): Grupo[] {
  const { android, ios } = tiendasApp();
  const hayTienda = Boolean(android || ios);

  const textoApp = hayTienda
    ? `Está en ${[android && "Google Play", ios && "App Store"].filter(Boolean).join(" y en ")}. Con tu cuenta compras pasajes, envías encomiendas y guardas tus pases de abordar.`
    : "La app de EnBus llega muy pronto a Google Play y App Store. Mientras tanto, rastrear un envío no necesita la app: se hace en esta misma página.";

  const contenidoApp = hayTienda ? (
    <p>
      Está en{" "}
      {android && (
        <a href={android} className="s-enlace" target="_blank" rel="noopener noreferrer">
          Google Play
        </a>
      )}
      {android && ios && " y en "}
      {ios && (
        <a href={ios} className="s-enlace" target="_blank" rel="noopener noreferrer">
          App Store
        </a>
      )}
      . Con tu cuenta compras pasajes, envías encomiendas y guardas tus pases de abordar.
    </p>
  ) : undefined;

  return [
    {
      id: "pasajes",
      titulo: "Pasajes",
      preguntas: [
        {
          pregunta: "¿Cómo compro un pasaje?",
          parrafos: [
            "En la app de EnBus. Buscas origen, destino y fecha, comparas las salidas de varias cooperativas, eliges tu asiento en el mapa del bus y pagas. Tu pase de abordar queda guardado en la app.",
          ],
        },
        {
          pregunta: "¿Cuánto tiempo se aparta mi asiento?",
          parrafos: [
            "30 minutos, mientras haces el pago. Si no lo completas en ese tiempo, el asiento se libera para otros pasajeros.",
          ],
        },
        {
          pregunta: "¿Y si no puedo viajar?",
          parrafos: [
            "Si cancelas antes de la hora de salida, te devuelven el 95 % del pasaje. Si es la cooperativa quien cancela el viaje, te devuelve el 100 %. En ambos casos, por el mismo medio con que pagaste.",
          ],
        },
      ],
    },
    {
      id: "pagos",
      titulo: "Pagos",
      preguntas: [
        {
          pregunta: "¿En qué moneda pago?",
          parrafos: [
            "Los precios se muestran en dólares como referencia y pagas en bolívares a la tasa oficial del BCV del día. Antes de pagar ves el monto exacto en bolívares.",
            "Los métodos dependen de la cooperativa: Pago Móvil, transferencia, Zelle o efectivo en taquilla.",
          ],
        },
        {
          pregunta: "¿Por qué pago directo a la cooperativa?",
          parrafos: [
            "Porque EnBus no toca tu dinero: el pago va a la cuenta de la cooperativa que te lleva. Ella verifica la referencia y te avisamos cuando tu boleto queda confirmado.",
          ],
        },
      ],
    },
    {
      id: "viaje",
      titulo: "El día del viaje",
      preguntas: [
        {
          pregunta: "¿Qué llevo el día del viaje?",
          parrafos: [
            "Tu cédula y el pase de abordar con su código QR, que queda guardado en la app. En el andén escanean el QR y te confirman el asiento.",
          ],
        },
      ],
    },
    {
      id: "encomiendas",
      titulo: "Encomiendas",
      preguntas: [
        {
          pregunta: "¿Cómo rastreo una encomienda?",
          parrafos: [
            "Con el código de seguimiento de tu guía, que tiene la forma EB-AAMMDD-NNNNN. Lo escribes en el rastreador de esta página, sin crear cuenta, o lo consultas en la app. Ves cada etapa del envío y recibes avisos mientras avanza.",
          ],
          contenido: (
            <p>
              Con el código de seguimiento de tu guía, que tiene la forma EB-AAMMDD-NNNNN. Lo escribes en el{" "}
              <Link href="/#rastrear" className="s-enlace">
                rastreador de esta página
              </Link>
              , sin crear cuenta, o lo consultas en la app. Ves cada etapa del envío y recibes avisos mientras avanza.
            </p>
          ),
        },
        {
          pregunta: "¿Qué no puedo enviar?",
          parrafos: [
            "Efectivo y joyas, armas, drogas y medicinas controladas, inflamables o explosivos, animales vivos y alimentos perecederos sin refrigeración. La lista completa está en los términos.",
          ],
          contenido: (
            <>
              <p>
                Efectivo y joyas, armas, drogas y medicinas controladas, inflamables o explosivos, animales vivos y
                alimentos perecederos sin refrigeración.
              </p>
              <p>
                La lista completa está en los{" "}
                <Link href={RUTAS_LEGALES.terminos} className="s-enlace">
                  términos
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          pregunta: "¿Quién puede retirar un paquete?",
          parrafos: [
            "La persona que indicaste al crear el envío, con su cédula y el PIN de 4 dígitos. Si nadie lo retira en 5 días hábiles, el paquete vuelve a la oficina de origen.",
          ],
        },
        {
          pregunta: "¿Está asegurado mi envío?",
          parrafos: [
            "Sí. Todos los envíos tienen seguro gratuito contra pérdida: te cubre hasta 3 veces el valor que declaraste al crearlo.",
          ],
        },
      ],
    },
    {
      id: "app",
      titulo: "La app",
      preguntas: [
        {
          pregunta: "¿Dónde descargo la app?",
          parrafos: [textoApp],
          contenido: contenidoApp,
        },
      ],
    },
  ];
}

/** Preguntas frecuentes: acordeón de <details name> (una abierta a la vez, sin JS) + FAQPage. */
export function Preguntas() {
  const lista = grupos();
  const whatsapp = soporteWhatsApp("Hola, tengo una pregunta sobre EnBus.");
  const correo = correoSoporte();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: lista.flatMap((g) =>
      g.preguntas.map((p) => ({
        "@type": "Question",
        name: p.pregunta,
        acceptedAnswer: { "@type": "Answer", text: p.parrafos.join(" ") },
      }))
    ),
  };

  return (
    <section id="preguntas" className="s-seccion s-seccion--papel" aria-labelledby="titulo-preguntas">
      <div className={`s-marco ${estilos.rejilla}`}>
        <div className={estilos.lateral}>
          <EncabezadoSeccion
            id="titulo-preguntas"
            etiqueta="Preguntas frecuentes"
            titulo="Lo que debes saber antes de viajar"
            bajada="Pasajes, pagos, reembolsos y encomiendas, en pocas palabras."
            className={estilos.cabecera}
          />
          {(whatsapp || correo) && (
            <div className={estilos.contacto}>
              <p className={estilos.contactoTitulo}>¿Otra duda? Escríbenos</p>
              <ul>
                {whatsapp && (
                  <li>
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                      <WhatsappLogo weight="regular" aria-hidden />
                      WhatsApp
                    </a>
                  </li>
                )}
                {correo && (
                  <li>
                    <a href={`mailto:${correo}`}>
                      <EnvelopeSimple weight="regular" aria-hidden />
                      {correo}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className={estilos.acordeon}>
          {lista.map((g) => (
            <div key={g.id} role="group" aria-labelledby={`preguntas-grupo-${g.id}`} className={estilos.grupo}>
              <h3 id={`preguntas-grupo-${g.id}`} className={estilos.rotulo}>
                {g.titulo}
              </h3>
              {g.preguntas.map((p) => (
                <details key={p.pregunta} name="preguntas" className={estilos.item}>
                  <summary>
                    <span>{p.pregunta}</span>
                    <span className={estilos.mas} aria-hidden />
                  </summary>
                  <div className={estilos.respuesta}>
                    {p.contenido ?? p.parrafos.map((t) => <p key={t}>{t}</p>)}
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </section>
  );
}
