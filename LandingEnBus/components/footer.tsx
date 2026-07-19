import {
  InstagramLogo,
  XLogo,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr"

const companyLinks = [
  { label: "Sobre nosotros", href: "#" },
  { label: "Contacto", href: "#" },
  { label: "Registra tu Cooperativa", href: "/registro-cooperativa" },
  { label: "Cooperativas afiliadas", href: "#" },
  { label: "Blog", href: "#" },
]

const serviceLinks = [
  { label: "Enviar paquete", href: "#" },
  { label: "Rastrear envio", href: "#" },
  { label: "Calculadora", href: "#" },
  { label: "Rutas", href: "#" },
]

const legalLinks = [
  { label: "Terminos y condiciones", href: "#" },
  { label: "Politica de privacidad", href: "#" },
  { label: "Politica de cookies", href: "#" },
]

const socialLinks = [
  { icon: InstagramLogo, href: "#", label: "Instagram" },
  { icon: XLogo, href: "#", label: "X" },
  { icon: WhatsappLogo, href: "#", label: "WhatsApp" },
]

export function Footer() {
  return (
    <footer className="bg-foreground py-16 text-background">
      <div className="mx-auto max-w-6xl px-6">
        {/* Top grid */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <span className="font-serif text-xl font-bold">EnBus</span>
            <p className="text-sm text-background/60">
              Envios seguros por toda Venezuela
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="text-background/60 transition hover:text-primary"
                >
                  <social.icon className="size-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Empresa */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-background">Empresa</h3>
            {companyLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-background/60 transition hover:text-background"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Servicios */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-background">
              Servicios
            </h3>
            {serviceLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-background/60 transition hover:text-background"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-background">Legal</h3>
            {legalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-background/60 transition hover:text-background"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-background/10 pt-8 sm:flex-row">
          <p className="text-sm text-background/60">
            &copy; 2026 EnBus. Todos los derechos reservados.
          </p>
          <p className="text-sm text-background/60">
            Una plataforma de Panas Cargo
          </p>
        </div>
      </div>
    </footer>
  )
}
