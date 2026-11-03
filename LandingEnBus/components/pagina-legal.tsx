import { Info, WhatsappLogo, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { correoSoporte, soporteWhatsApp } from "@/lib/urls"

/** Fecha que se muestra en las tres páginas legales. Cámbiala cada vez que cambie el texto. */
export const LEGAL_ACTUALIZADO = "3 de noviembre de 2026"

interface PaginaLegalProps {
  titulo: string
  /** Una o dos frases debajo del título: de qué trata la página. */
  resumen: string
  children: React.ReactNode
}

/**
 * Estructura común de /terminos, /privacidad y /eliminar-cuenta: título, fecha de
 * actualización, aviso de revisión legal (paso manual 5 de la fase 4) y el texto.
 */
export function PaginaLegal({ titulo, resumen, children }: PaginaLegalProps) {
  return (
    <>
      <Navbar />
      <main className="bg-muted/40 pt-24 pb-20 lg:pt-28">
        <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 sm:px-6">
          <header className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">{titulo}</h1>
            <p className="text-base leading-relaxed text-muted-foreground">{resumen}</p>
            <p className="text-sm text-muted-foreground">Última actualización: {LEGAL_ACTUALIZADO}</p>
            <p
              role="note"
              className="flex items-start gap-2 rounded-sm border border-info/40 bg-info-light p-3 text-sm text-info-deep"
            >
              <Info className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
              Este texto está en revisión legal.
            </p>
          </header>
          <div className="flex flex-col gap-8 rounded-sm border border-border bg-background p-5 text-base leading-relaxed text-foreground sm:p-8">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </>
  )
}

/** Sección con título dentro de una página legal. */
export function SeccionLegal({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** Lista con viñetas para las páginas legales. */
export function ListaLegal({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

const ENLACE = "font-semibold text-foreground underline underline-offset-4"

/**
 * Canales de contacto configurados (WhatsApp y correo de soporte). Si no hay ninguno,
 * muestra `sinCanales` (o nada): nunca se ofrece un canal que no existe.
 */
export function ContactoSoporte({ mensaje, sinCanales }: { mensaje: string; sinCanales?: React.ReactNode }) {
  const whatsapp = soporteWhatsApp(mensaje)
  const correo = correoSoporte()
  if (!whatsapp && !correo) return sinCanales ? <>{sinCanales}</> : null

  return (
    <ul className="flex flex-col gap-2">
      {whatsapp && (
        <li>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 ${ENLACE}`}
          >
            <WhatsappLogo className="size-5" aria-hidden />
            Escríbenos por WhatsApp
          </a>
        </li>
      )}
      {correo && (
        <li>
          <a
            href={`mailto:${correo}?subject=${encodeURIComponent(mensaje)}`}
            className={`inline-flex items-center gap-2 ${ENLACE}`}
          >
            <EnvelopeSimple className="size-5" aria-hidden />
            {correo}
          </a>
        </li>
      )}
    </ul>
  )
}
