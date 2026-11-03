import { ArrowRight, Clock } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { formatNumeroVE } from "@/lib/dinero"

// Precios de referencia en USD. Esta copia de la landing no consulta la tasa BCV
// (la página se genera en el build y quedaría con una tasa vieja): muestra solo
// USD y la nota de cobro en bolívares. La landing pública (LandingEnBus) sí
// muestra el equivalente en Bs con la tasa del día.
const routes = [
  { origin: "Caracas", destination: "Maracaibo", price: 15, hours: 8 },
  { origin: "Valencia", destination: "Barinas", price: 10, hours: 6 },
  { origin: "Maracay", destination: "Mérida", price: 12, hours: 10 },
  { origin: "Caracas", destination: "Barquisimeto", price: 8, hours: 5 },
  { origin: "Puerto La Cruz", destination: "Cumaná", price: 6, hours: 3 },
  { origin: "San Cristóbal", destination: "Caracas", price: 18, hours: 12 },
]

/** 15 -> "15"; 15.5 -> "15,50" */
function precioCorto(usd: number) {
  return Number.isInteger(usd) ? formatNumeroVE(usd, 0) : formatNumeroVE(usd)
}

export function PopularRoutes() {
  return (
    <section id="rutas" className="bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">
            Rutas populares
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Principales destinos con cobertura activa
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {routes.map((route) => (
            <div
              key={`${route.origin}-${route.destination}`}
              className="rounded-sm border p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-2 text-lg font-medium">
                <span>{route.origin}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span>{route.destination}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-semibold text-primary">
                  Desde USD {precioCorto(route.price)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" weight="duotone" />~{route.hours}{" "}
                  horas
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Precios de referencia en dólares. Pagas en bolívares a la tasa BCV del día.
        </p>

        <div className="mt-12 text-center">
          <Button variant="outline" size="lg">
            Ver todas las rutas
          </Button>
        </div>
      </div>
    </section>
  )
}
