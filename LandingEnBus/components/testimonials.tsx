import { Quotes, Star } from "@phosphor-icons/react/dist/ssr"

// Sección de reseñas. No se renderiza en la portada (app/page.tsx) hasta tener
// reseñas reales de pasajeros; los testimonios de ejemplo se eliminaron (L-05).

export interface Resena {
  texto: string
  nombre: string
  ciudad: string
  /** 1 a 5 */
  calificacion: number
}

export function Testimonials({ resenas = [] }: { resenas?: Resena[] }) {
  if (resenas.length === 0) return null

  return (
    <section className="bg-muted/50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight lg:text-4xl">
          Lo que dicen nuestros pasajeros
        </h2>

        <ul className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {resenas.map((resena) => (
            <li key={`${resena.nombre}-${resena.ciudad}`} className="rounded-sm border bg-background p-8">
              <Quotes className="size-8 text-foreground/30" weight="fill" aria-hidden />
              <p className="mt-4 leading-relaxed text-foreground italic">&ldquo;{resena.texto}&rdquo;</p>
              <div className="mt-6 border-t pt-4">
                <p className="font-semibold">{resena.nombre}</p>
                <p className="text-sm text-muted-foreground">{resena.ciudad}</p>
                <p className="mt-2 flex gap-0.5" aria-label={`${resena.calificacion} de 5 estrellas`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={i < resena.calificacion ? "size-4 text-amber-600" : "size-4 text-muted-foreground/40"}
                      weight="fill"
                      aria-hidden
                    />
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
