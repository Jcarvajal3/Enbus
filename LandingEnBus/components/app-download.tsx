import {
  CheckCircle,
  AppleLogo,
  GooglePlayLogo,
} from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@/components/ui/badge"

const features = [
  "Cotiza y reserva envios al instante",
  "Seguimiento en tiempo real de tus paquetes",
  "Notificaciones de estado y PIN de retiro",
]

export function AppDownload() {
  return (
    <section className="bg-background py-24 lg:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <h2 className="font-serif text-3xl font-bold tracking-tight lg:text-4xl">
            Lleva EnBus en tu bolsillo
          </h2>

          <p className="text-lg leading-relaxed text-muted-foreground">
            Envia, rastrea y gestiona tus paquetes desde la comodidad de tu
            telefono. Disponible proximamente en todas las tiendas.
          </p>

          <ul className="flex flex-col gap-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <CheckCircle
                  className="size-5 shrink-0 text-primary"
                  weight="fill"
                />
                <span className="text-foreground">{feature}</span>
              </li>
            ))}
          </ul>

          {/* Store buttons */}
          <div className="mt-2 flex flex-wrap gap-4">
            {/* Apple App Store */}
            <div className="relative">
              <div className="flex cursor-not-allowed items-center gap-3 rounded-sm border bg-foreground px-5 py-3 opacity-50">
                <AppleLogo className="size-7 text-background" weight="fill" />
                <div className="flex flex-col">
                  <span className="text-xs leading-tight text-background/70">
                    Descarga en
                  </span>
                  <span className="text-sm font-semibold leading-tight text-background">
                    App Store
                  </span>
                </div>
              </div>
              <Badge className="absolute -top-2 -right-2" variant="secondary">
                Proximamente
              </Badge>
            </div>

            {/* Google Play */}
            <div className="relative">
              <div className="flex cursor-not-allowed items-center gap-3 rounded-sm border bg-foreground px-5 py-3 opacity-50">
                <GooglePlayLogo
                  className="size-7 text-background"
                  weight="fill"
                />
                <div className="flex flex-col">
                  <span className="text-xs leading-tight text-background/70">
                    Descarga en
                  </span>
                  <span className="text-sm font-semibold leading-tight text-background">
                    Google Play
                  </span>
                </div>
              </div>
              <Badge className="absolute -top-2 -right-2" variant="secondary">
                Proximamente
              </Badge>
            </div>
          </div>
        </div>

        {/* Right column — phone mockup placeholder */}
        <div className="flex justify-center">
          <div className="flex aspect-[9/16] w-full max-w-xs items-center justify-center rounded-sm bg-muted/50">
            <span className="text-sm text-muted-foreground">App Mockup</span>
          </div>
        </div>
      </div>
    </section>
  )
}
