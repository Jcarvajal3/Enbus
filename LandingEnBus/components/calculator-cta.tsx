import { Calculator } from "@phosphor-icons/react/dist/ssr"

import { Calculadora } from "@/components/calculadora"
import type { OrigenConDestinos } from "@/lib/consultas"

/**
 * Sección #calcular con la calculadora real. Sin rutas activas (o sin configuración)
 * no se muestra; el hero y el menú ocultan sus enlaces a #calcular en ese caso.
 */
export function CalculatorCTA({ origenes }: { origenes: OrigenConDestinos[] }) {
  if (origenes.length === 0) return null

  return (
    <section id="calcular" className="scroll-mt-20 bg-primary py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <Calculator className="mx-auto size-12 text-foreground" aria-hidden />
          <h2 className="mt-6 font-serif text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Calcula el costo de tu envío
          </h2>
          <p className="mt-4 text-lg text-foreground/85">
            Sin registro. Elige origen, destino y peso, y compara el precio de cada cooperativa.
          </p>
        </div>

        <div className="mt-10">
          <Calculadora origenes={origenes} />
        </div>
      </div>
    </section>
  )
}
