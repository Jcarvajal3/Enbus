"use client"

import * as React from "react"
import { Clock, Spinner, Star, WarningCircle } from "@phosphor-icons/react"

import { buttonVariants } from "@/components/ui/button"
import { formatMoney, formatNumeroVE } from "@/lib/dinero"
import { formatCiudad } from "@/lib/ve.generated"
import type { OrigenConDestinos } from "@/lib/consultas"
import { cotizarEnvio, type CampoCalculadora, type EstadoCalculadora } from "@/app/rastrear/actions"

const ESTADO_INICIAL: EstadoCalculadora = {}

/** 510 -> "~8 h 30 min"; 45 -> "~45 min". */
function duracion(min: number | null): string | null {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `~${m} min`
  return m ? `~${h} h ${m} min` : `~${h} h`
}

/** 2 -> "2"; 2.5 -> "2,5"; 2.25 -> "2,25" (sin ceros de más). */
function pesoTexto(kg: number): string {
  return formatNumeroVE(kg, 3).replace(/,?0+$/, "")
}

function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null
  return (
    <p id={id} className="campo-error flex items-start gap-1.5">
      <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {mensaje}
    </p>
  )
}

/**
 * Calculadora de costo de envío (sección #calcular). Pide origen, destino y peso y
 * muestra el precio referencial de cada cooperativa con ruta activa.
 */
export function Calculadora({ origenes }: { origenes: OrigenConDestinos[] }) {
  const [state, formAction, pendiente] = React.useActionState(cotizarEnvio, ESTADO_INICIAL)
  // Campos controlados: React reinicia los formularios no controlados tras cada acción.
  const [origen, setOrigen] = React.useState("")
  const [destino, setDestino] = React.useState("")
  const [peso, setPeso] = React.useState("")
  const resultadoRef = React.useRef<HTMLDivElement>(null)

  const destinos = React.useMemo(
    () => origenes.find((o) => o.origen === origen)?.destinos ?? [],
    [origenes, origen]
  )

  const campos: Partial<Record<CampoCalculadora, string>> = state.campos ?? {}
  const errorGeneral = state.error && !Object.values(campos).includes(state.error) ? state.error : null

  // Tras calcular, el foco va al resultado (o al primer campo con error).
  React.useEffect(() => {
    if (state.resultado) {
      resultadoRef.current?.focus()
      return
    }
    const primero = (["origen", "destino", "peso"] as const).find((c) => state.campos?.[c])
    if (primero) document.getElementById(`calc-${primero}`)?.focus()
  }, [state])

  const resultado = state.resultado

  return (
    <div className="rounded-md border border-foreground/15 bg-card p-5 text-left sm:p-6">
      <form action={formAction} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-start">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="calc-origen" className="campo-etiqueta">
            Origen
          </label>
          <select
            id="calc-origen"
            name="origen"
            value={origen}
            onChange={(e) => {
              setOrigen(e.target.value)
              setDestino("")
            }}
            aria-invalid={campos.origen ? true : undefined}
            aria-describedby={campos.origen ? "calc-origen-error" : undefined}
            disabled={pendiente}
            className="campo-control"
          >
            <option value="">Elige la ciudad</option>
            {origenes.map((o) => (
              <option key={o.origen} value={o.origen}>
                {formatCiudad(o.origen)}
              </option>
            ))}
          </select>
          <ErrorCampo id="calc-origen-error" mensaje={campos.origen} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="calc-destino" className="campo-etiqueta">
            Destino
          </label>
          <select
            id="calc-destino"
            name="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            aria-invalid={campos.destino ? true : undefined}
            aria-describedby={campos.destino ? "calc-destino-error" : "calc-destino-ayuda"}
            disabled={pendiente || !origen}
            className="campo-control"
          >
            <option value="">{origen ? "Elige la ciudad" : "Primero elige el origen"}</option>
            {destinos.map((d) => (
              <option key={d} value={d}>
                {formatCiudad(d)}
              </option>
            ))}
          </select>
          {campos.destino ? (
            <ErrorCampo id="calc-destino-error" mensaje={campos.destino} />
          ) : (
            <p id="calc-destino-ayuda" className="campo-ayuda">
              Solo ciudades con ruta activa.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="calc-peso" className="campo-etiqueta">
            Peso (kg)
          </label>
          <input
            id="calc-peso"
            name="peso"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 2,5"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            aria-invalid={campos.peso ? true : undefined}
            aria-describedby={campos.peso ? "calc-peso-error" : "calc-peso-ayuda"}
            disabled={pendiente}
            className="campo-control"
          />
          {campos.peso ? (
            <ErrorCampo id="calc-peso-error" mensaje={campos.peso} />
          ) : (
            <p id="calc-peso-ayuda" className="campo-ayuda">
              Aproximado, en kilos.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {/* Separador para alinear el botón con los campos en escritorio */}
          <span className="campo-etiqueta hidden select-none sm:block" aria-hidden>
            &nbsp;
          </span>
          <button
            type="submit"
            disabled={pendiente}
            className={`${buttonVariants({ size: "lg" })} focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2`}
          >
            {pendiente && <Spinner className="size-4 animate-spin" aria-hidden />}
            {pendiente ? "Calculando…" : "Calcular"}
          </button>
        </div>
      </form>

      {errorGeneral && (
        <p role="alert" className="campo-error mt-4 flex items-start gap-1.5 rounded-md bg-destructive-light p-3">
          <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorGeneral}
        </p>
      )}

      <div ref={resultadoRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {resultado && (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-base font-semibold text-foreground">
              {formatCiudad(resultado.origen)} → {formatCiudad(resultado.destino)} · {pesoTexto(resultado.pesoKg)} kg
            </h3>

            {resultado.opciones.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Ninguna cooperativa tiene esta ruta activa por ahora. Prueba con una ciudad cercana.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {resultado.opciones.map((o) => {
                  const monto = formatMoney({ usd: o.costo_usd, bs: o.costo_bs, tasa: resultado.tasa, moneda: "USD" })
                  const tiempo = duracion(o.duracion_min)
                  return (
                    <li
                      key={o.cooperativa_id || o.cooperativa}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{o.cooperativa}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {o.calificacion !== null && o.calificacion > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="size-3.5" weight="fill" aria-hidden />
                              <span className="sr-only">Calificación </span>
                              {formatNumeroVE(o.calificacion, 1)}
                            </span>
                          )}
                          {tiempo && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3.5" aria-hidden />
                              <span className="sr-only">Duración del viaje </span>
                              {tiempo}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-col sm:items-end">
                        <span className="sr-only">{monto.accesible}</span>
                        <span aria-hidden className="text-lg font-semibold text-foreground tabular-nums">
                          {monto.principal}
                        </span>
                        {monto.secundario && (
                          <span aria-hidden className="text-xs text-muted-foreground tabular-nums">
                            {monto.secundario}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <p className="campo-ayuda mt-3">
              Precio referencial; la taquilla confirma el costo al pesar el paquete.
              {resultado.peso_max_kg ? ` Peso máximo por envío: ${formatNumeroVE(resultado.peso_max_kg, 0)} kg.` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
