import { Calculator, Package, Truck } from "@phosphor-icons/react/dist/ssr"

const steps = [
  {
    number: "01",
    icon: Calculator,
    title: "Cotiza tu envio",
    description:
      "Ingresa origen, destino y peso. Recibe cotizaciones al instante de cooperativas verificadas.",
  },
  {
    number: "02",
    icon: Package,
    title: "Reserva y entrega",
    description:
      "Selecciona la cooperativa, confirma el pago y entrega tu paquete en la agencia mas cercana.",
  },
  {
    number: "03",
    icon: Truck,
    title: "Recibe con tranquilidad",
    description:
      "Sigue tu envio en tiempo real. El destinatario recibe notificacion y PIN de retiro.",
  },
] as const

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Enviar un paquete nunca fue tan sencillo
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className="border-l-4 border-primary pl-6"
              >
                <span className="text-6xl font-bold text-muted-foreground/20">
                  {step.number}
                </span>
                <div className="mt-4 flex items-center gap-3">
                  <Icon className="size-6 text-primary" weight="duotone" />
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
