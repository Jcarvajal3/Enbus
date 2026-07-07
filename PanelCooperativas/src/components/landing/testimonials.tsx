"use client"

import { Quotes, Star } from "@phosphor-icons/react"

const testimonials = [
  {
    quote:
      "Envie un paquete de Caracas a Maracaibo y llego en menos de 10 horas. El seguimiento en tiempo real me dio mucha tranquilidad.",
    name: "Maria Rodriguez",
    location: "Caracas, Venezuela",
  },
  {
    quote:
      "Como comerciante, necesitaba una forma confiable de enviar productos a mis clientes en el interior. EnBus ha sido la solucion perfecta.",
    name: "Carlos Mendez",
    location: "Valencia, Venezuela",
  },
  {
    quote:
      "Los precios son muy competitivos y el servicio es excelente. Ya he enviado mas de 20 paquetes sin ningun problema.",
    name: "Ana Gutierrez",
    location: "Barquisimeto, Venezuela",
  },
]

export function Testimonials() {
  return (
    <section className="bg-muted/50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight lg:text-4xl">
          Lo que dicen nuestros usuarios
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="rounded-sm border bg-background p-8"
            >
              <Quotes className="size-8 text-primary/30" weight="fill" />

              <p className="mt-4 leading-relaxed text-foreground italic">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              <div className="mt-6 border-t pt-4">
                <p className="font-semibold">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">
                  {testimonial.location}
                </p>
                <div className="mt-2 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="size-4 text-primary"
                      weight="fill"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
