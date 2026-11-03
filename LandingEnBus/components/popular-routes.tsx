import { ArrowRight, Clock, CalendarBlank } from "@phosphor-icons/react/dist/ssr"

import { formatMoney, formatNumeroVE, type TasaRef } from "@/lib/dinero"
import type { RutaPopular } from "@/lib/consultas"
import { formatCiudad } from "@/lib/ve.generated"

/** 15 -> "USD 15"; 10.5 -> "USD 10,50" */
function usdCorto(usd: number) {
  return `USD ${Number.isInteger(usd) ? formatNumeroVE(usd, 0) : formatNumeroVE(usd)}`
}

/** 510 -> "~8 h 30 min" */
function duracion(min: number | null): string | null {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `~${m} min`
  return m ? `~${h} h ${m} min` : `~${h} h`
}

function salidas(n: number): string {
  if (n <= 0) return "Sin salidas programadas por ahora"
  return n === 1 ? "1 salida próxima" : `${n} salidas próximas`
}

interface PopularRoutesProps {
  /** Rutas de `fn_rutas_populares`; sin datos, la sección no se muestra. */
  rutas: RutaPopular[]
  tasa: TasaRef | null
}

/**
 * Rutas con más salidas próximas. Precio "desde" en USD de referencia y su
 * equivalente en Bs a la tasa BCV vigente (la portada se regenera cada 30 min).
 */
export function PopularRoutes({ rutas, tasa }: PopularRoutesProps) {
  if (rutas.length === 0) return null

  return (
    <section id="rutas" className="scroll-mt-20 bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">Rutas populares</h2>
          <p className="mt-4 text-lg text-muted-foreground">Las rutas con más salidas en los próximos días</p>
        </div>

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rutas.map((ruta) => {
            const monto = formatMoney({ usd: ruta.desde_usd, tasa, moneda: "USD" })
            const tiempo = duracion(ruta.duracion_min)
            return (
              <li key={`${ruta.ciudad_origen}-${ruta.ciudad_destino}`} className="rounded-md border border-border bg-card p-5">
                <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
                  <span>{formatCiudad(ruta.ciudad_origen)}</span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  <span className="sr-only">a</span>
                  <span>{formatCiudad(ruta.ciudad_destino)}</span>
                </p>
                <p className="mt-3 text-sm tabular-nums">
                  <span className="sr-only">{`Desde ${monto.accesible}`}</span>
                  <span aria-hidden>
                    <span className="font-semibold text-foreground">Desde {usdCorto(ruta.desde_usd)}</span>
                    {monto.secundario && tasa && (
                      <span className="text-muted-foreground"> · {monto.secundario}</span>
                    )}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarBlank className="size-4" aria-hidden />
                    {salidas(ruta.salidas_proximas)}
                  </span>
                  {tiempo && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden />
                      {tiempo}
                    </span>
                  )}
                  {ruta.cooperativas > 1 && <span>{ruta.cooperativas} cooperativas</span>}
                </div>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Precios de referencia en dólares. Pagas en bolívares a la tasa BCV del día.
        </p>
      </div>
    </section>
  )
}
