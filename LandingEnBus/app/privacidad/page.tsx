import type { Metadata } from "next"

import { ContactoSoporte, ListaLegal, PaginaLegal, SeccionLegal } from "@/components/pagina-legal"
import { RUTAS_LEGALES, sitioUrl } from "@/lib/urls"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos guarda EnBus, para qué los usa, con quién los comparte, cuánto tiempo los conserva y cómo puedes corregirlos o eliminar tu cuenta.",
  ...(sitioUrl() ? { alternates: { canonical: RUTAS_LEGALES.privacidad } } : {}),
}

export default function PrivacidadPage() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      resumen="Qué datos tuyos guardamos, para qué los usamos y qué puedes hacer con ellos. Solo pedimos lo necesario para emitir tus boletos y mover tus encomiendas."
    >
      <SeccionLegal id="que-guardamos" titulo="Qué datos guardamos">
        <ListaLegal
          items={[
            <>
              <strong>Tus datos de cuenta:</strong> nombre completo, cédula, teléfono y correo. Si entras con Google,
              también tu nombre y correo de Google.
            </>,
            <>
              <strong>Datos de los pasajeros que tú escribes</strong> al comprar boletos para otras personas: nombre,
              cédula y teléfono.
            </>,
            <>
              <strong>Datos de quien recibe tus envíos:</strong> nombre, cédula y teléfono, y la descripción, el peso
              y el valor declarado del paquete.
            </>,
            <>
              <strong>Fotos del paquete</strong> que tomas tú o la taquilla al recibirlo, y la foto de la entrega.
            </>,
            <>
              <strong>Datos de tus pagos:</strong> monto, banco, número de referencia y fecha de la operación. No
              guardamos claves ni datos de tarjetas.
            </>,
            <>
              <strong>Tus boletos y envíos:</strong> rutas, fechas, asientos, estados, reembolsos y las calificaciones
              que dejes a un viaje.
            </>,
            <>
              <strong>El identificador de notificaciones</strong> de tu teléfono, para enviarte avisos, y tus
              preferencias de notificación.
            </>,
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="para-que" titulo="Para qué los usamos">
        <ListaLegal
          items={[
            "Emitir tus boletos y las guías de tus encomiendas.",
            "Que la cooperativa verifique tu pago y te identifique al embarcar o al retirar un paquete.",
            "Avisarte de cambios: pago aprobado o rechazado, viaje reprogramado o cancelado, encomienda en camino o lista para retirar.",
            "Darte soporte cuando nos escribes.",
          ]}
        />
        <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>
      </SeccionLegal>

      <SeccionLegal id="con-quien" titulo="Con quién los compartimos">
        <ListaLegal
          items={[
            <>
              <strong>Solo con la cooperativa que te presta el servicio</strong>: ve los datos del boleto o del envío
              que hiciste con ella, no los de otras cooperativas.
            </>,
            <>
              <strong>Proveedores técnicos</strong> que nos ayudan a funcionar: alojamiento de datos, envío de correos
              y envío de notificaciones. Solo usan los datos para prestarnos ese servicio.
            </>,
            "Autoridades, solo si una ley u orden judicial nos obliga.",
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="cuanto-tiempo" titulo="Cuánto tiempo los guardamos">
        <p>
          Mientras tengas la cuenta. Si la eliminas, borramos tu nombre, cédula, teléfono, notificaciones y el
          identificador de notificaciones. Los boletos y envíos que hiciste se conservan{" "}
          <strong>sin tus datos personales</strong>, porque son registros contables de las cooperativas.
        </p>
      </SeccionLegal>

      <SeccionLegal id="derechos" titulo="Tus derechos">
        <ListaLegal
          items={[
            <>
              <strong>Ver y corregir tus datos</strong> en la app, en <strong>Perfil</strong>.
            </>,
            <>
              <strong>Elegir qué notificaciones recibes</strong> en Perfil.
            </>,
            <>
              <strong>Eliminar tu cuenta</strong> desde la app o pidiéndolo por escrito. Te explicamos cómo en{" "}
              <a href={RUTAS_LEGALES.eliminarCuenta} className="font-medium text-info-text underline underline-offset-4">
                Eliminar tu cuenta
              </a>
              .
            </>,
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="seguridad" titulo="Cómo los protegemos">
        <p>
          Los datos viajan cifrados y cada persona solo ve lo que le corresponde: tú ves tus boletos y envíos, y cada
          cooperativa ve únicamente los suyos. El código de seguimiento muestra en qué va un envío, pero no los datos
          de quien lo envía ni de quien lo recibe.
        </p>
      </SeccionLegal>

      <SeccionLegal id="contacto" titulo="Contacto">
        <ContactoSoporte
          mensaje="Hola, tengo una pregunta sobre mis datos en EnBus."
          sinCanales={<p>Escríbenos desde la sección Ayuda de la app.</p>}
        />
      </SeccionLegal>
    </PaginaLegal>
  )
}
