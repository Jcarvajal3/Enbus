import { Handshake, ArrowRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

export function CooperativaCTA() {
  return (
    <section className="border-t border-zinc-900 bg-zinc-950 py-20 text-center lg:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <Handshake className="mx-auto size-12 text-primary" aria-hidden />

        <h2 className="mt-6 font-serif text-3xl font-bold tracking-tight text-white lg:text-4xl">
          ¿Representas a una cooperativa de transporte?
        </h2>

        <p className="mt-4 font-sans text-lg text-zinc-300">
          Afíliate a EnBus y digitaliza la venta de boletos, el envío de encomiendas y la administración de tu
          flota en todo el país.
        </p>

        <Link
          href="/registro-cooperativa"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          Conoce cómo afiliarte
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
