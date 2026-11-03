import { MapPin, Tag, NavigationArrow, ShieldCheck } from "@phosphor-icons/react/dist/ssr"

import type { Estadisticas } from "@/lib/consultas"

function coberturaTexto(e?: Estadisticas | null): string {
  if (e && e.ciudades > 1 && e.cooperativas > 0) {
    const coops = e.cooperativas === 1 ? "1 cooperativa activa" : `${e.cooperativas} cooperativas activas`
    return `${e.ciudades} ciudades conectadas por ${coops} en toda Venezuela.`
  }
  return "Cooperativas de transporte de todo el país en una sola plataforma."
}

export function Benefits({ estadisticas }: { estadisticas?: Estadisticas | null }) {
  const benefits = [
    {
      icon: MapPin,
      title: "Cobertura nacional",
      description: coberturaTexto(estadisticas),
    },
    {
      icon: Tag,
      title: "Precios claros",
      description:
        "Ves el precio de referencia en dólares y cuánto pagas en bolívares a la tasa BCV del día, antes de confirmar.",
    },
    {
      icon: NavigationArrow,
      title: "Sigue tu viaje o tu envío",
      description: "Consulta el estado de tu encomienda con su código de seguimiento, desde que la entregas hasta que la retiran.",
    },
    {
      icon: ShieldCheck,
      title: "Cooperativas verificadas",
      description:
        "Revisamos los datos de cada cooperativa antes de que pueda vender boletos o recibir encomiendas.",
    },
  ]

  return (
    <section className="bg-muted/50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">Por qué EnBus</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Boletos y encomiendas con cooperativas en las que puedes confiar
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="rounded-sm border bg-background p-6 shadow-sm">
              <div className="flex size-12 items-center justify-center rounded-sm bg-primary/20">
                <benefit.icon className="size-6 text-foreground" weight="duotone" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
