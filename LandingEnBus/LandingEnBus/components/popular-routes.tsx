import { ArrowRight } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"

const routes = [
  {
    origin: "Caracas",
    destination: "Maracaibo",
    price: "15",
    hours: "8",
  },
  {
    origin: "Valencia",
    destination: "Barinas",
    price: "10",
    hours: "6",
  },
  {
    origin: "Maracay",
    destination: "Merida",
    price: "12",
    hours: "10",
  },
  {
    origin: "Caracas",
    destination: "Barquisimeto",
    price: "8",
    hours: "5",
  },
  {
    origin: "Puerto La Cruz",
    destination: "Cumana",
    price: "6",
    hours: "3",
  },
  {
    origin: "San Cristobal",
    destination: "Caracas",
    price: "18",
    hours: "12",
  },
] as const

export function PopularRoutes() {
  return (
    <section id="rutas" className="bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
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
              <div className="flex items-center gap-3">
                <span className="font-semibold">{route.origin}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className="font-semibold">{route.destination}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-semibold text-primary">
                  desde {route.price} USD
                </span>
                <span className="text-sm text-muted-foreground">
                  ~{route.hours} horas
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button variant="outline" size="lg">
            Ver todas las rutas
          </Button>
        </div>
      </div>
    </section>
  )
}
