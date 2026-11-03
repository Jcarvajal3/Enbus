import { Handshake, ArrowRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export function CooperativaCTA() {
  return (
    <section className="border-b border-background/15 bg-foreground py-20 text-center lg:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <Handshake className="mx-auto size-12 text-primary" aria-hidden />

        <h2 className="mt-6 font-serif text-3xl font-semibold tracking-tight text-background lg:text-4xl">
          ¿Representas a una cooperativa de transporte?
        </h2>

        <p className="mt-4 font-sans text-lg text-background/80">
          Afíliate a EnBus y digitaliza la venta de boletos, el envío de encomiendas y la administración de tu
          flota en todo el país.
        </p>

        <Link
          href="/registro-cooperativa"
          className={`${buttonVariants({ size: "lg" })} mt-8 focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground`}
        >
          Conoce cómo afiliarte
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
