import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr"

import { cooperativasUrl, soporteWhatsApp } from "@/lib/urls"

// Sobre fondo oscuro el foco usa el color de fondo de la página (claro).
const ENLACE =
  "w-fit rounded-sm text-sm text-background/80 transition hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background"

interface FooterProps {
  /** Secciones de la portada que se están mostrando (las que no hay no se enlazan). */
  secciones?: { rutas?: boolean; calcular?: boolean }
}

export function Footer({ secciones = {} }: FooterProps) {
  const portal = cooperativasUrl()
  const whatsapp = soporteWhatsApp("Hola, necesito ayuda con EnBus.")
  const anio = new Date().getFullYear()

  const servicios = [
    { label: "Rastrear encomienda", href: "/rastrear" },
    ...(secciones.calcular ? [{ label: "Calcular costo de envío", href: "/#calcular" }] : []),
    ...(secciones.rutas ? [{ label: "Rutas populares", href: "/#rutas" }] : []),
    { label: "Cómo funciona", href: "/#como-funciona" },
  ]

  const cooperativas = [
    { label: "Registra tu cooperativa", href: "/registro-cooperativa" },
    ...(portal ? [{ label: "Entrar al panel", href: `${portal}/cooperativas/login` }] : []),
  ]

  return (
    <footer className="bg-foreground py-16 text-background">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Marca */}
          <div className="flex flex-col gap-4">
            <span className="font-serif text-xl font-bold">EnBus</span>
            <p className="text-sm text-background/80">
              Boletos de bus y encomiendas por toda Venezuela, con cooperativas verificadas.
            </p>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${ENLACE} inline-flex items-center gap-2`}>
                <WhatsappLogo className="size-5" aria-hidden />
                Escríbenos por WhatsApp
              </a>
            )}
          </div>

          {/* Servicios */}
          <nav aria-labelledby="footer-servicios" className="flex flex-col gap-3">
            <h3 id="footer-servicios" className="text-sm font-semibold text-background">
              Servicios
            </h3>
            {servicios.map((link) => (
              <a key={link.href} href={link.href} className={ENLACE}>
                {link.label}
              </a>
            ))}
          </nav>

          {/* Cooperativas */}
          <nav aria-labelledby="footer-cooperativas" className="flex flex-col gap-3">
            <h3 id="footer-cooperativas" className="text-sm font-semibold text-background">
              Cooperativas
            </h3>
            {cooperativas.map((link) => (
              <a key={link.href} href={link.href} className={ENLACE}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Sin enlaces legales ni redes hasta que existan sus páginas */}
        <div className="mt-12 border-t border-background/15 pt-8">
          <p className="text-sm text-background/80">&copy; {anio} EnBus. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
