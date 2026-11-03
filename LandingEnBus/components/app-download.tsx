import { CheckCircle, AppleLogo, GooglePlayLogo, WhatsappLogo } from "@phosphor-icons/react/dist/ssr"

import { soporteWhatsApp } from "@/lib/urls"

const features = [
  "Compra tu boleto y elige tu asiento",
  "Envía encomiendas y sigue cada etapa",
  "Recibe tu pase de abordaje y el PIN de retiro",
]

const tiendas = [
  { nombre: "App Store", icon: AppleLogo },
  { nombre: "Google Play", icon: GooglePlayLogo },
]

export function AppDownload() {
  const avisame = soporteWhatsApp("Hola, quiero que me avisen cuando la app de EnBus esté disponible.")

  return (
    <section className="bg-background py-24 lg:py-32">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6">
        <h2 className="font-serif text-3xl font-bold tracking-tight lg:text-4xl">Lleva EnBus en tu teléfono</h2>

        <p className="text-lg leading-relaxed text-muted-foreground">
          Muy pronto podrás comprar boletos, enviar encomiendas y seguirlas desde la app de EnBus.
        </p>

        <ul className="flex flex-col gap-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <CheckCircle className="size-5 shrink-0 text-foreground" weight="fill" aria-hidden />
              <span className="text-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        {/* Tiendas: todavía no publicadas (no son enlaces) */}
        <ul className="mt-2 flex flex-wrap gap-4" aria-label="Tiendas de aplicaciones">
          {tiendas.map((tienda) => (
            <li
              key={tienda.nombre}
              className="flex items-center gap-3 rounded-sm border border-input-border bg-background px-5 py-3"
            >
              <tienda.icon className="size-7 text-foreground" weight="fill" aria-hidden />
              <div className="flex flex-col">
                <span className="text-sm leading-tight font-semibold text-foreground">{tienda.nombre}</span>
                <span className="text-xs leading-tight text-muted-foreground">Próximamente</span>
              </div>
            </li>
          ))}
        </ul>

        {avisame && (
          <a
            href={avisame}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm bg-foreground px-5 text-sm font-semibold text-background transition-colors outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
          >
            <WhatsappLogo className="size-5" aria-hidden />
            Avísame por WhatsApp
          </a>
        )}
      </div>
    </section>
  )
}
