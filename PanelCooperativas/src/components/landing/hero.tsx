import { ArrowRight, MapPin, ShieldCheck, MapTrifold } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"

const trustItems = [
  {
    icon: MapPin,
    label: "50+ Ciudades",
  },
  {
    icon: ShieldCheck,
    label: "Cooperativas Verificadas",
  },
  {
    icon: MapTrifold,
    label: "Seguimiento en Tiempo Real",
  },
] as const

export function Hero() {
  return (
    <section
      id="inicio"
      className="relative min-h-[calc(100vh-4rem)] bg-primary"
    >
      <div className="mx-auto flex max-w-7xl flex-col px-4 pt-28 pb-16 lg:px-8 lg:pt-32 lg:pb-20">
        {/* Main content — two columns */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            {/* Badge */}
            <span className="inline-flex w-fit items-center rounded-sm border border-foreground/20 px-3 py-1 text-xs font-medium tracking-widest text-foreground/70 uppercase">
              Envios a nivel nacional
            </span>

            {/* Heading */}
            <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.15]">
              Envia tus paquetes por toda Venezuela, facil y seguro
            </h1>

            {/* Subtitle */}
            <p className="max-w-lg text-base leading-relaxed text-foreground/70 lg:text-lg">
              Conectamos tu envio con cooperativas de transporte verificadas.
              Cobertura en mas de 50 ciudades con seguimiento en tiempo real.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                size="lg"
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Calcular costo de envio
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="border-foreground/20 bg-transparent text-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                Rastrear paquete
              </Button>
            </div>
          </div>

          {/* Right column — placeholder image */}
          <div className="flex items-center justify-center">
            <div className="flex aspect-video w-full items-center justify-center rounded-sm bg-foreground/10 text-sm text-foreground/40">
              Imagen de servicio de envios
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-16 border-t border-foreground/10 pt-10 lg:mt-20 lg:pt-12">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
            {trustItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3"
              >
                <item.icon
                  className="size-6 shrink-0 text-foreground/60"
                  weight="duotone"
                />
                <span className="text-sm font-medium text-foreground">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
