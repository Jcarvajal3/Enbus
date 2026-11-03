import type { Metadata } from "next"

import { ContactoSoporte, ListaLegal, PaginaLegal, SeccionLegal } from "@/components/pagina-legal"
import { correoSoporte, RUTAS_LEGALES, sitioUrl, soporteWhatsApp } from "@/lib/urls"

export const metadata: Metadata = {
  title: "Eliminar tu cuenta",
  description:
    "Cómo eliminar tu cuenta de EnBus desde la app o por escrito, qué datos se borran y qué se conserva.",
  ...(sitioUrl() ? { alternates: { canonical: RUTAS_LEGALES.eliminarCuenta } } : {}),
}

export default function EliminarCuentaPage() {
  const whatsapp = soporteWhatsApp()
  const correo = correoSoporte()
  const hayCanal = Boolean(whatsapp || correo)

  return (
    <PaginaLegal
      titulo="Eliminar tu cuenta de EnBus"
      resumen="Puedes eliminar tu cuenta cuando quieras. Aquí te explicamos cómo hacerlo y qué pasa con tus datos."
    >
      <SeccionLegal id="desde-la-app" titulo="Desde la app">
        <p>
          Abre la app y ve a <strong>Perfil › Eliminar mi cuenta</strong>. Confirma y listo: se cierra tu sesión y ya
          no podrás volver a entrar con esa cuenta.
        </p>
      </SeccionLegal>

      <SeccionLegal id="sin-la-app" titulo="Si ya no tienes la app">
        {hayCanal ? (
          <>
            <p>
              Escríbenos {whatsapp && <strong>por WhatsApp desde el teléfono de tu cuenta</strong>}
              {whatsapp && correo && " o "}
              {correo && <strong>al correo de soporte desde el correo de tu cuenta</strong>}, y la eliminamos en un
              máximo de <strong>7 días</strong>. Así confirmamos que la cuenta es tuya.
            </p>
            <ContactoSoporte mensaje="Hola, quiero eliminar mi cuenta de EnBus." />
          </>
        ) : (
          <p>
            Instala la app de nuevo en cualquier teléfono, inicia sesión con tu cuenta y elimínala desde{" "}
            <strong>Perfil › Eliminar mi cuenta</strong>.
          </p>
        )}
      </SeccionLegal>

      <SeccionLegal id="antes" titulo="Antes de eliminarla">
        <p>Para no dejar nada a medias, primero tienen que terminar:</p>
        <ListaLegal
          items={[
            "Los boletos por usar (de viajes que todavía no han salido).",
            "Los pagos que la cooperativa aún está verificando.",
            "Las encomiendas que enviaste o que esperas recibir y todavía están en camino.",
            "Los reembolsos que la cooperativa todavía no te ha enviado.",
          ]}
        />
        <p>Si tienes alguno, la app te dice cuál y podrás eliminar la cuenta cuando termine.</p>
      </SeccionLegal>

      <SeccionLegal id="que-se-borra" titulo="Qué se borra">
        <ListaLegal
          items={[
            "Tu nombre, cédula y teléfono.",
            "Tus notificaciones y el identificador para enviarte avisos.",
            "Tu acceso: el correo y la contraseña de la cuenta (o el acceso con Google) dejan de funcionar.",
          ]}
        />
      </SeccionLegal>

      <SeccionLegal id="que-se-conserva" titulo="Qué se conserva">
        <p>
          Los boletos, envíos y pagos que hiciste se conservan <strong>sin tus datos personales</strong>, porque son
          registros contables de las cooperativas. Nadie podrá relacionarlos contigo desde la app.
        </p>
        <p className="text-sm text-muted-foreground">
          Más detalles en la{" "}
          <a href={RUTAS_LEGALES.privacidad} className="font-medium text-info-text underline underline-offset-4">
            Política de privacidad
          </a>
          .
        </p>
      </SeccionLegal>
    </PaginaLegal>
  )
}
