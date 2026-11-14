import type { Metadata } from "next"

import { ContactoSoporte, ListaLegal, PaginaLegal, SeccionLegal } from "@/components/sitio/legal"
import { RUTAS_LEGALES, sitioUrl } from "@/lib/sitio/urls"

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Cómo funciona EnBus: compra de boletos, pagos en bolívares a la tasa BCV, cancelaciones y reembolsos, y reglas de las encomiendas.",
  ...(sitioUrl() ? { alternates: { canonical: RUTAS_LEGALES.terminos } } : {}),
}

// Lista referencial de #31 (la misma que muestra la app en "Nueva encomienda").
const NO_PERMITIDOS = [
  "Dinero en efectivo, joyas y objetos de valor que no se pueden asegurar.",
  "Armas y municiones, incluidas réplicas, partes de armas y armas blancas.",
  "Drogas y medicinas controladas (las que requieren récipe especial).",
  "Líquidos inflamables o explosivos: gasolina, gas, pinturas con solvente, fuegos artificiales y aerosoles.",
  "Animales vivos, aunque vayan en jaula.",
  "Alimentos perecederos: carne, pescado, lácteos y comida que se daña sin refrigeración.",
]

export default function TerminosPage() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      resumen="Las reglas para comprar boletos y enviar encomiendas con EnBus, explicadas sin letra pequeña. Al usar la app o la web aceptas estos términos."
    >
      <SeccionLegal id="que-es" titulo="Qué es EnBus">
        <p>
          EnBus es una plataforma que te conecta con cooperativas de transporte de Venezuela. Con EnBus compras
          boletos de bus y envías encomiendas, pero <strong>quien te transporta a ti o a tu paquete es la
          cooperativa</strong>: ella fija sus rutas, horarios y precios, verifica los pagos, te embarca y entrega los
          envíos.
        </p>
        <p>
          Solo trabajamos con cooperativas que revisamos antes de publicarlas. Si tienes un problema con un viaje o un
          envío, escríbele a la cooperativa o a nosotros y te ayudamos a resolverlo.
        </p>
      </SeccionLegal>

      <SeccionLegal id="cuenta" titulo="Tu cuenta">
        <ListaLegal
          items={[
            "Para comprar boletos o enviar encomiendas necesitas una cuenta con tu nombre, cédula, teléfono y correo reales. Rastrear un envío no necesita cuenta.",
            "Tu cuenta es personal. Cuida tu contraseña: lo que se haga con tu cuenta se considera hecho por ti.",
            "Puedes eliminar tu cuenta cuando quieras (ver “Eliminar tu cuenta”).",
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="precios" titulo="Precios y pagos">
        <ListaLegal
          items={[
            <>
              Los precios se muestran en <strong>dólares (USD) como referencia</strong> y se cobran en{" "}
              <strong>bolívares (Bs) a la tasa oficial del BCV del día</strong> en que pagas. Antes de pagar ves el
              monto exacto en bolívares.
            </>,
            "Pagas directamente a la cuenta de la cooperativa (Pago Móvil, transferencia u otro método que ella acepte), o en su taquilla. EnBus no recibe tu dinero.",
            "Cuando pagas por Pago Móvil o transferencia, la cooperativa revisa la referencia. Tu boleto o tu envío se confirma cuando ella verifica el pago; si la referencia no coincide, te avisamos para que la corrijas.",
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="reservas" titulo="Reservas de asientos">
        <p>
          Al elegir tu asiento lo apartamos por <strong>30 minutos</strong> (o hasta la hora de salida, si falta
          menos) para que completes el pago. Si no pagas a tiempo, la reserva vence y el asiento vuelve a quedar
          libre para otros pasajeros.
        </p>
      </SeccionLegal>

      <SeccionLegal id="cancelaciones" titulo="Cancelaciones y reembolsos">
        <ListaLegal
          items={[
            <>
              <strong>Si cancelas tú</strong> antes de la salida, te devolvemos el <strong>95 % del pasaje</strong>.
              Después de la hora de salida ya no se puede cancelar.
            </>,
            <>
              <strong>Si la cooperativa cancela el viaje</strong>, te devuelve el <strong>100 %</strong>.
            </>,
            "El reembolso lo hace la cooperativa, por el mismo medio con que pagaste o el que acuerde contigo. En la app ves cuándo lo envía y su referencia.",
            "Si la cooperativa cambia la hora de tu viaje, te avisamos. Si la nueva hora no te sirve, escríbele a la cooperativa.",
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="embarque" titulo="El día del viaje">
        <p>
          Llega con tiempo a la oficina de la cooperativa con tu cédula y el pase de abordar (el código QR de tu
          boleto). La cooperativa puede pedirte que muestres tu cédula para confirmar que el boleto es tuyo.
        </p>
      </SeccionLegal>

      <SeccionLegal id="encomiendas" titulo="Encomiendas">
        <ListaLegal
          items={[
            "Describe con honestidad lo que envías. La taquilla puede revisar el paquete y rechazarlo si no cumple las reglas.",
            "El costo depende del peso y de la ruta. Puedes pagarlo al enviar o dejarlo para que lo pague quien retira.",
            <>
              El seguro cubre <strong>hasta 3 veces el valor que declares</strong> si el paquete se pierde o se daña
              mientras está a cargo de la cooperativa.
            </>,
            <>
              Quien recibe retira el paquete en la oficina de destino con su cédula y el <strong>PIN de retiro</strong>.
              El PIN es personal: dáselo solo a quien va a retirar y no lo publiques.
            </>,
            <>
              Si nadie retira el paquete en <strong>5 días hábiles</strong> desde que llega a la oficina de destino, se
              devuelve a la oficina de origen para que el remitente lo busque.
            </>,
          ]}
        />
        <h3>Qué no se puede enviar</h3>
        <ListaLegal items={NO_PERMITIDOS} />
        <p className="s-legal__nota">
          Lista referencial: cada cooperativa puede tener reglas adicionales y la taquilla tiene la última palabra al
          recibir el paquete.
        </p>
      </SeccionLegal>

      <SeccionLegal id="uso" titulo="Uso correcto">
        <p>
          No uses EnBus para enviar artículos prohibidos, hacer pagos con datos falsos, revender boletos ni suplantar
          a otra persona. Si lo haces, podemos suspender tu cuenta.
        </p>
      </SeccionLegal>

      <SeccionLegal id="datos" titulo="Tus datos">
        <p>
          Lo que guardamos y para qué está en la{" "}
          <a href={RUTAS_LEGALES.privacidad} className="s-enlace">
            Política de privacidad
          </a>
          .
        </p>
      </SeccionLegal>

      <SeccionLegal id="cambios" titulo="Cambios a estos términos">
        <p>
          Si cambiamos estos términos, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos en
          la app.
        </p>
      </SeccionLegal>

      <SeccionLegal id="contacto" titulo="Contacto">
        <ContactoSoporte
          mensaje="Hola, tengo una pregunta sobre los términos de EnBus."
          sinCanales={<p>Escríbele a la cooperativa con la que viajas o envías desde la sección Ayuda de la app.</p>}
        />
      </SeccionLegal>
    </PaginaLegal>
  )
}
