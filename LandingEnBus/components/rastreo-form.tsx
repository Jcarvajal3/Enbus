"use client"

import * as React from "react"
import Form from "next/form"
import { useRouter } from "next/navigation"
import { MagnifyingGlass, Spinner, WarningCircle } from "@phosphor-icons/react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CODIGO_EJEMPLO } from "@/lib/estados"

interface RastreoFormProps {
  /** "hero": sobre el amarillo de marca; "pagina": sobre fondo blanco. */
  variante?: "hero" | "pagina"
  codigoInicial?: string
  className?: string
}

/**
 * Formulario "Rastrea tu encomienda": navega a /rastrear?codigo=… (funciona
 * también sin JavaScript, como un formulario GET). Con JavaScript, la navegación
 * va en una transición para mostrar "Buscando…" hasta que llega el resultado
 * (también al repetir el mismo código) y evitar envíos repetidos.
 */
export function RastreoForm({ variante = "pagina", codigoInicial = "", className }: RastreoFormProps) {
  const id = React.useId()
  const inputId = `${id}-codigo`
  const ayudaId = `${id}-ayuda`
  const errorId = `${id}-error`
  const [error, setError] = React.useState<string | null>(null)
  const [buscando, startTransition] = React.useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (buscando) return
    const valor = String(new FormData(e.currentTarget).get("codigo") ?? "").trim()
    if (!valor) {
      setError("Escribe el código de seguimiento de tu encomienda.")
      document.getElementById(inputId)?.focus()
      return
    }
    startTransition(() => {
      router.push(`/rastrear?codigo=${encodeURIComponent(valor)}`)
    })
  }

  const enHero = variante === "hero"

  return (
    <Form
      action="/rastrear"
      onSubmit={handleSubmit}
      noValidate
      role="search"
      aria-label="Rastrear encomienda"
      aria-busy={buscando || undefined}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <label htmlFor={inputId} className={cn("campo-etiqueta", enHero && "text-base font-semibold")}>
        Rastrea tu encomienda
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          name="codigo"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={codigoInicial}
          placeholder={`Código de seguimiento, ej. ${CODIGO_EJEMPLO}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${ayudaId}` : ayudaId}
          onChange={() => error && setError(null)}
          className="campo-control flex-1 uppercase placeholder:normal-case"
        />
        <button
          type="submit"
          aria-disabled={buscando || undefined}
          className={cn(
            // En el héroe (amarillo) el botón va en tinta; en el resto, el amarillo de la acción principal.
            buttonVariants({ variant: enHero ? "contraste" : "default", size: "lg" }),
            "aria-disabled:cursor-wait aria-disabled:opacity-80",
            "focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2",
            enHero ? "focus-visible:ring-offset-primary" : "focus-visible:ring-offset-background"
          )}
        >
          {buscando ? (
            <Spinner className="size-4 animate-spin" aria-hidden />
          ) : (
            <MagnifyingGlass className="size-4" aria-hidden />
          )}
          {buscando ? "Buscando…" : "Rastrear"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="campo-error flex items-center gap-1.5">
          <WarningCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <p id={ayudaId} className={cn("campo-ayuda", enHero && "text-foreground/80")}>
        Lo encuentras en la app o en el comprobante de la taquilla (empieza por EB-).
      </p>
    </Form>
  )
}
