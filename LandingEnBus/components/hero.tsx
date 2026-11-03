import { ArrowRight, MapPin, ShieldCheck, MapTrifold, DeviceMobile } from "@phosphor-icons/react/dist/ssr"

import { RastreoForm } from "@/components/rastreo-form"
import type { Estadisticas } from "@/lib/consultas"

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`
}

interface HeroProps {
  /** Cifras reales de la base; sin ellas, la franja no muestra números. */
  estadisticas?: Estadisticas | null
  /** true si la calculadora (#calcular) se está mostrando. */
  calculadora?: boolean
}

export function Hero({ estadisticas, calculadora = false }: HeroProps) {
  const trustItems = [
    {
      icon: ShieldCheck,
      label:
        estadisticas && estadisticas.cooperativas > 0
          ? plural(estadisticas.cooperativas, "cooperativa verificada", "cooperativas verificadas")
          : "Cooperativas verificadas",
    },
    ...(estadisticas && estadisticas.ciudades > 1
      ? [{ icon: MapPin, label: `${estadisticas.ciudades} ciudades conectadas` }]
      : []),
    { icon: DeviceMobile, label: "Pago Móvil o transferencia" },
    { icon: MapTrifold, label: "Rastreo con código de seguimiento" },
  ]

  return (
    <section id="inicio" className="relative bg-primary">
      <div className="mx-auto flex max-w-7xl flex-col px-4 pt-28 pb-16 lg:px-8 lg:pt-32 lg:pb-20">
        <div className="flex max-w-3xl flex-col gap-6">
          <span className="inline-flex w-fit items-center rounded-sm border border-foreground/30 px-3 py-1 text-xs font-medium tracking-widest text-foreground uppercase">
            Boletos y encomiendas
          </span>

          <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.15]">
            Boletos de bus y encomiendas por toda Venezuela, en un solo lugar
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-foreground/85 lg:text-lg">
            Compra tu pasaje o envía tu paquete con cooperativas verificadas. Paga con Pago Móvil o
            transferencia y sigue tu viaje o tu envío.
          </p>

          {/* CTA primario: rastreo en línea */}
          <div className="max-w-xl rounded-sm bg-background/40 p-4 sm:p-5">
            <RastreoForm variante="hero" />
          </div>

          {/* CTA secundario */}
          {calculadora && (
            <a
              href="#calcular"
              className="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Calcular costo de envío
              <ArrowRight className="size-4" aria-hidden />
            </a>
          )}
        </div>

        {/* Franja de confianza */}
        <ul className="mt-14 grid grid-cols-1 gap-6 border-t border-foreground/15 pt-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4 lg:gap-8">
          {trustItems.map((item) => (
            <li key={item.label} className="flex items-center gap-3">
              <item.icon className="size-6 shrink-0 text-foreground/80" weight="duotone" aria-hidden />
              <span className="text-sm font-medium text-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
