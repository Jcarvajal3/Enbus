import Link from "next/link";

import { RUTAS_LEGALES, tiendasApp } from "@/lib/sitio/urls";

/** Preguntas antes de comprar, archivadas como fichas con pestaña. Una abierta a la vez. */
export function Preguntas() {
  const tiendas = tiendasApp();
  const hayTienda = Boolean(tiendas.android || tiendas.ios);

  const fichas = [
    {
      tema: "Pago",
      pregunta: "¿En qué moneda pago?",
      respuesta: (
        <>
          <p>
            Los precios se muestran en dólares como referencia y pagas en bolívares a la tasa oficial del BCV del día en
            que pagas. Antes de pagar ves el monto exacto en bolívares.
          </p>
          <p>
            Pagas directo a la cuenta de la cooperativa, por Pago Móvil, transferencia u otro método que ella acepte, o en
            su taquilla.
          </p>
        </>
      ),
    },
    {
      tema: "Cancelar",
      pregunta: "¿Y si no puedo viajar?",
      respuesta: (
        <p>
          Si cancelas antes de la hora de salida, te devuelven el 95 % del pasaje. Si es la cooperativa quien cancela el
          viaje, te devuelve el 100 %, por el mismo medio con que pagaste.
        </p>
      ),
    },
    {
      tema: "Embarque",
      pregunta: "¿Qué llevo el día del viaje?",
      respuesta: (
        <p>
          Tu cédula y el pase de abordar con su código QR, que queda guardado en la app. Llega con tiempo a la oficina de
          la cooperativa: en el andén escanean el QR y te confirman el asiento.
        </p>
      ),
    },
    {
      tema: "Paquetes",
      pregunta: "¿Qué no puedo enviar?",
      respuesta: (
        <>
          <p>
            Dinero en efectivo y joyas, armas, drogas y medicinas controladas, líquidos inflamables o explosivos, animales
            vivos y alimentos que se dañan sin refrigeración.
          </p>
          <p>
            La lista completa está en los{" "}
            <Link href={RUTAS_LEGALES.terminos} className="s-enlace">
              términos
            </Link>
            . La taquilla tiene la última palabra al recibir el paquete.
          </p>
        </>
      ),
    },
    {
      tema: "Retiro",
      pregunta: "¿Quién puede retirar un paquete?",
      respuesta: (
        <p>
          La persona que indicaste al crear el envío, con su cédula y el PIN de retiro. El PIN es personal: compártelo
          solo con quien va a retirar. Si nadie lo busca en 5 días hábiles, vuelve a la oficina de origen.
        </p>
      ),
    },
    {
      tema: "La app",
      pregunta: "¿Dónde descargo la app?",
      respuesta: hayTienda ? (
        <p>
          Está en{" "}
          {tiendas.android && (
            <a href={tiendas.android} className="s-enlace" target="_blank" rel="noopener noreferrer">
              Google Play
            </a>
          )}
          {tiendas.android && tiendas.ios && " y en "}
          {tiendas.ios && (
            <a href={tiendas.ios} className="s-enlace" target="_blank" rel="noopener noreferrer">
              App Store
            </a>
          )}
          . Con tu cuenta compras boletos, envías encomiendas y guardas tus pases.
        </p>
      ) : (
        <p>
          La app de EnBus llega pronto a Google Play y App Store. Mientras tanto, rastrear un envío no necesita la app:
          se hace en esta misma página.
        </p>
      ),
    },
  ];

  return (
    <section id="preguntas" className="s-seccion" aria-labelledby="titulo-preguntas">
      <div className="s-preguntas__columna">
        <h2 id="titulo-preguntas" className="s-titulo" data-revelar>
          Antes de comprar
        </h2>
        <div className="s-fichas">
          {fichas.map((f, i) => (
            <details
              key={f.tema}
              className="s-ficha"
              name="preguntas"
              open={i === 0}
              style={{ ["--i" as string]: i }}
              data-revelar
            >
              <summary>
                <span className="s-ficha__tema" aria-hidden>
                  {f.tema}
                </span>
                <span>{f.pregunta}</span>
                <span className="s-mas" aria-hidden />
              </summary>
              <div className="s-ficha__respuesta">{f.respuesta}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
