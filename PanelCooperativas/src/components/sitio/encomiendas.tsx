import Image, { type StaticImageData } from "next/image";

import { formatNumeroVE, usdABs, type TasaRef } from "@/lib/dinero.generated";
import { FOTOS } from "./fotos";

/** Costo de muestra del fragmento "Nueva encomienda" (USD de referencia). */
const COSTO_MUESTRA_USD = 6.4;

function Foto({ src, alt, credito, foco }: { src: StaticImageData; alt: string; credito: string; foco: string }) {
  return (
    <div className="s-hoja__media s-hoja__media--foto" style={{ ["--foco" as string]: foco }}>
      <Image src={src} alt={alt} fill sizes="(max-width: 900px) 100vw, 50vw" placeholder="blur" />
      <span className="s-hoja__credito">{credito}</span>
    </div>
  );
}

/** Fragmento de la app: el formulario "Nueva encomienda" con un costo estimado. */
function NuevaEncomienda({ tasa }: { tasa: TasaRef | null }) {
  return (
    <div className="s-hoja__media">
      <div className="s-app" data-ui role="img" aria-label="Pantalla de la app: nueva encomienda de Valencia a Barquisimeto, 3,5 kg, con su costo estimado">
        <p className="s-app__titulo">Nueva encomienda</p>
        <div className="s-app__fila">
          <div className="s-app__campo">
            <span>Desde</span>
            <strong>Valencia</strong>
          </div>
          <div className="s-app__campo">
            <span>Hasta</span>
            <strong>Barquisimeto</strong>
          </div>
        </div>
        <div className="s-app__fila">
          <div className="s-app__campo">
            <span>Peso aproximado</span>
            <strong className="s-num">3,5 kg</strong>
          </div>
          <div className="s-app__campo">
            <span>Contenido</span>
            <strong>Ropa</strong>
          </div>
        </div>
        <div className="s-app__campo">
          <span>Retira en destino</span>
          <strong>Ana Rodríguez</strong>
        </div>
        <div className="s-app__costo">
          <strong className="s-num">${formatNumeroVE(COSTO_MUESTRA_USD)}</strong>
          <span className="s-num">
            {tasa ? `Bs ${formatNumeroVE(usdABs(COSTO_MUESTRA_USD, tasa.tasa))} a la tasa BCV` : "Se paga en Bs a la tasa BCV"}
          </span>
        </div>
        <div className="s-app__boton">Crear envío</div>
      </div>
    </div>
  );
}

/** Fragmento de la app: el PIN de retiro de una encomienda que ya llegó. */
function PinRetiro() {
  return (
    <div className="s-hoja__media">
      <div className="s-app s-app--noche" data-ui role="img" aria-label="Pantalla de la app: PIN de retiro de cuatro dígitos de una encomienda lista para retirar">
        <p className="s-app__titulo">PIN de retiro</p>
        <div className="s-app__pin s-num" aria-hidden>
          <span>4</span>
          <span>8</span>
          <span>2</span>
          <span>7</span>
        </div>
        <div className="s-app__campo">
          <span>Encomienda</span>
          <strong className="s-num">EB-261113-04821</strong>
        </div>
        <span className="s-app__chip">Lista para retirar</span>
      </div>
    </div>
  );
}

/**
 * Las cuatro etapas de un envío, cada una en una hoja de color que se apila sobre la
 * anterior al hacer scroll, como fichas en una gaveta.
 */
export function Encomiendas({ tasa }: { tasa: TasaRef | null }) {
  return (
    <section id="encomiendas" className="s-seccion" aria-labelledby="titulo-encomiendas">
      <div className="s-marco s-encomiendas__titulo">
        <h2 id="titulo-encomiendas" className="s-titulo" data-revelar>
          Envía un paquete en el bus
        </h2>
        <p data-revelar style={{ ["--d" as string]: 1 }}>
          Lo que antes era llevar la caja al terminal y esperar una llamada, ahora tiene guía, código y aviso en cada
          etapa.
        </p>
      </div>

      <ol className="s-hojas">
        <li className="s-hoja" style={{ ["--i" as string]: 0 }}>
          <h3>Créalo en la app</h3>
          <p className="s-hoja__texto">
            Dices qué envías, cuánto pesa y quién lo retira. Antes de salir de casa ves el costo estimado en dólares y
            en bolívares.
          </p>
          <NuevaEncomienda tasa={tasa} />
        </li>
        <li className="s-hoja" style={{ ["--i" as string]: 1 }}>
          <h3>Llévalo a la taquilla</h3>
          <p className="s-hoja__texto">
            La taquilla lo revisa, lo pesa y te entrega la guía con su código de seguimiento. Lo pagas ahí, o lo paga{" "}
            <strong>quien lo retira</strong>.
          </p>
          <Foto
            src={FOTOS.terminalCarmenArismendi}
            alt="Fachada del Terminal de Pasajeros Carmen Arismendi al atardecer, con edificios detrás"
            credito="Terminal Carmen Arismendi"
            foco="50% 66%"
          />
        </li>
        <li className="s-hoja" style={{ ["--i" as string]: 2 }}>
          <h3>Viaja en el próximo bus</h3>
          <p className="s-hoja__texto">
            Sale en el siguiente viaje de la ruta. Con el código <strong>EB</strong> de la guía lo sigues etapa por
            etapa, aquí mismo o en la app, sin crear cuenta.
          </p>
          <Foto
            src={FOTOS.monagas}
            alt="Carretera que baja entre árboles hacia la llanura de Monagas"
            credito="Bajada de Santa Bárbara, Monagas"
            foco="50% 78%"
          />
        </li>
        <li className="s-hoja" style={{ ["--i" as string]: 3 }}>
          <h3>Retíralo con tu PIN</h3>
          <p className="s-hoja__texto">
            En la oficina de destino piden la cédula y el PIN de retiro. El seguro cubre hasta{" "}
            <strong>3 veces el valor declarado</strong>, y si nadie lo busca en 5 días hábiles, vuelve al origen.
          </p>
          <PinRetiro />
        </li>
      </ol>
    </section>
  );
}
