import { Calculator, ArrowRight } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"

export function CalculatorCTA() {
  return (
    <section className="bg-primary py-20 text-center lg:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <Calculator className="mx-auto size-12 text-foreground/80" />

        <h2 className="mt-6 font-serif text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
          Calcula el costo de tu envio en segundos
        </h2>

        <p className="mt-4 text-lg text-foreground/70">
          Sin registro. Sin compromiso. Conoce el precio antes de enviar tu
          paquete.
        </p>

        <Button size="lg" className="mt-8 bg-foreground text-background hover:bg-foreground/90">
          Calcular ahora
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </section>
  )
}
