import {
  MapPin,
  NavigationArrow,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react/dist/ssr"

const benefits = [
  {
    icon: MapPin,
    title: "Cobertura Nacional",
    description:
      "Mas de 50 ciudades conectadas en toda Venezuela a traves de nuestra red de cooperativas.",
  },
  {
    icon: Tag,
    title: "Precios Transparentes",
    description:
      "Sin cargos ocultos. Conoce el precio exacto de tu envio antes de confirmar.",
  },
  {
    icon: NavigationArrow,
    title: "Seguimiento en Tiempo Real",
    description:
      "Sigue el estado de tu paquete desde la salida hasta la entrega.",
  },
  {
    icon: ShieldCheck,
    title: "Cooperativas Verificadas",
    description:
      "Todas las cooperativas pasan un proceso de verificacion para garantizar la calidad del servicio.",
  },
] as const

export function Benefits() {
  return (
    <section className="bg-muted/50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Por que EnBus
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            La plataforma de envios en la que puedes confiar
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => {
            const Icon = benefit.icon
            return (
              <div
                key={benefit.title}
                className="rounded-sm border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex size-12 items-center justify-center rounded-sm bg-primary/10">
                  <Icon className="size-6 text-primary" weight="duotone" />
                </div>
                <h3 className="mt-4 font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
