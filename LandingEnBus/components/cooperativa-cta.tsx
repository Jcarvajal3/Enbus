import { Handshake, ArrowRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CooperativaCTA() {
  return (
    <section className="bg-zinc-950 py-20 text-center lg:py-28 border-t border-zinc-900">
      <div className="mx-auto max-w-2xl px-6">
        <Handshake className="mx-auto size-12 text-primary animate-pulse" />

        <h2 className="mt-6 font-serif text-3xl font-bold tracking-tight text-white lg:text-4xl">
          ¿Representas a una cooperativa de transporte?
        </h2>

        <p className="mt-4 text-lg text-zinc-400 font-sans">
          Afíliate a EnBus y digitaliza la venta de boletos, el envío de encomiendas y la administración de tu flota en todo el país.
        </p>

        <Link href="/registro-cooperativa" passHref>
          <Button size="lg" className="mt-8 bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer">
            Registrar mi Cooperativa
            <ArrowRight data-icon="inline-end" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
