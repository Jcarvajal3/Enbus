import { MagnifyingGlass, CreditCard, Ticket } from "@phosphor-icons/react/dist/ssr"

const steps = [
  {
    number: "01",
    icon: MagnifyingGlass,
    title: "Elige tu viaje o cotiza tu envío",
    description:
      "Busca la salida y el asiento que quieres, o calcula cuánto cuesta enviar tu paquete con cada cooperativa.",
  },
  {
    number: "02",
    icon: CreditCard,
    title: "Paga con Pago Móvil o transferencia",
    description:
      "Los precios de referencia están en dólares y pagas en bolívares a la tasa BCV del día. La cooperativa verifica tu pago.",
  },
  {
    number: "03",
    icon: Ticket,
    title: "Viaja o sigue tu encomienda",
    description:
      "Muestra tu pase de abordaje en la taquilla. Si envías un paquete, síguelo con su código; quien lo recibe lo retira con un PIN.",
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">Cómo funciona</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Comprar un pasaje o enviar una encomienda, en tres pasos
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="border-l-4 border-primary pl-6">
              <span className="text-6xl font-bold text-muted-foreground/30" aria-hidden>
                {step.number}
              </span>
              <div className="mt-4 flex items-center gap-3">
                <step.icon className="size-6 shrink-0 text-foreground" aria-hidden />
                <h3 className="text-lg font-semibold">{step.title}</h3>
              </div>
              <p className="mt-3 leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
