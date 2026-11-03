import type { Metadata } from "next"
import { ArrowRight, CheckCircle, Circle, WarningCircle, XCircle } from "@phosphor-icons/react/dist/ssr"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { RastreoForm } from "@/components/rastreo-form"
import { rastrearEncomienda, type EstadoRastreo } from "./actions"
import type { EncomiendaPublica, Lugar } from "@/lib/consultas"
import {
  CLASES_TONO,
  CODIGO_EJEMPLO,
  ETAPAS_ENCOMIENDA,
  estadoEncomienda,
} from "@/lib/estados"
import { normalizarTracking } from "@/lib/artefactos.generated"
import { formatCiudad, formatDiaHoraVE } from "@/lib/ve.generated"
import { sitioUrl, soporteWhatsApp } from "@/lib/urls"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Rastrear encomienda",
  description: "Consulta en qué va tu encomienda con su código de seguimiento (EB-AAMMDD-NNNNN).",
  // Sin ?codigo=: cada búsqueda no es una página distinta para los buscadores.
  ...(sitioUrl() ? { alternates: { canonical: "/rastrear" } } : {}),
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/** "mar. 3 nov. · 2:30 p. m." (D4, hora de Venezuela); null sin fecha válida. */
function fechaHora(iso: string | null | undefined): string | null {
  if (!iso) return null
  return formatDiaHoraVE(iso) || null
}

const ENLACE = "w-fit font-medium text-info-text underline underline-offset-4"

function lugar(l: Lugar): string {
  return [formatCiudad(l.ciudad), formatCiudad(l.estado)].filter(Boolean).join(", ") || "Sin dato"
}

// ─── Línea de tiempo ─────────────────────────────────────────────────────────

interface Paso {
  etiqueta: string
  fecha: string | null
  estado: "hecho" | "actual" | "pendiente" | "cierre"
}

/**
 * Etapas públicas (Envío creado → Entregada) con la fecha de la primera vez que
 * se alcanzó cada una. CANCELADA y DEVUELTA cierran la línea donde se quedó.
 */
function construirPasos(e: EncomiendaPublica): Paso[] {
  const primeraFecha = (estados: readonly string[]) =>
    e.historial.find((h) => estados.includes(h.estado))?.fecha ?? null

  const indiceDe = (estado: string) => ETAPAS_ENCOMIENDA.findIndex((etapa) => etapa.estados.some((s) => s === estado))

  // Etapa más avanzada alcanzada según el historial y el estado actual.
  let alcanzada = 0
  for (const h of [...e.historial, { estado: e.estado, fecha: "" }]) {
    alcanzada = Math.max(alcanzada, indiceDe(h.estado))
  }

  const cerrada = e.estado === "CANCELADA" || e.estado === "DEVUELTA"
  const ultima = e.estado === "ENTREGADA"

  const pasos: Paso[] = ETAPAS_ENCOMIENDA.map((etapa, i) => {
    const fecha = i === 0 ? e.creada_at : primeraFecha(etapa.estados)
    let estado: Paso["estado"] = "pendiente"
    if (i < alcanzada || (i === alcanzada && (ultima || cerrada))) estado = "hecho"
    else if (i === alcanzada) estado = "actual"
    return { etiqueta: etapa.etiqueta, fecha: fechaHora(fecha), estado }
  })

  if (cerrada) {
    const fin = estadoEncomienda(e.estado)
    const fecha = [...e.historial].reverse().find((h) => h.estado === e.estado)?.fecha ?? e.actualizada_at
    return [...pasos.slice(0, alcanzada + 1), { etiqueta: fin.etiqueta, fecha: fechaHora(fecha), estado: "cierre" }]
  }
  return pasos
}

function LineaDeTiempo({ pasos }: { pasos: Paso[] }) {
  return (
    <ol className="flex flex-col">
      {pasos.map((paso, i) => {
        const Icono = paso.estado === "cierre" ? XCircle : paso.estado === "pendiente" ? Circle : CheckCircle
        const ultimo = i === pasos.length - 1
        return (
          <li key={`${paso.etiqueta}-${i}`} className="relative flex gap-3 pb-6 last:pb-0">
            {!ultimo && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-7 left-[11px] h-[calc(100%-1.75rem)] w-0.5",
                  paso.estado === "hecho" ? "bg-foreground" : "bg-border"
                )}
              />
            )}
            <Icono
              aria-hidden
              weight={paso.estado === "pendiente" ? "regular" : "fill"}
              className={cn(
                "size-6 shrink-0",
                paso.estado === "pendiente" ? "text-muted-foreground" : "text-foreground",
                paso.estado === "actual" && "text-warning-text"
              )}
            />
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm font-medium",
                  paso.estado === "pendiente" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {paso.etiqueta}
                {paso.estado === "actual" && <span className="ml-2 text-xs font-semibold">(estado actual)</span>}
                {paso.estado === "pendiente" && <span className="sr-only"> (pendiente)</span>}
              </span>
              {paso.fecha && paso.estado !== "pendiente" && (
                <span className="text-xs text-muted-foreground tabular-nums">{paso.fecha}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Resultado ───────────────────────────────────────────────────────────────

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-light p-4 text-sm">
      <WarningCircle className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
      <div className="flex flex-col gap-1 text-foreground">
        <p className="font-semibold">{titulo}</p>
        {children}
      </div>
    </div>
  )
}

function Resultado({ resultado, codigo }: { resultado: EstadoRastreo; codigo: string }) {
  const whatsapp = soporteWhatsApp(`Hola, necesito ayuda para rastrear la encomienda ${codigo}.`)
  const enlaceAyuda = whatsapp && (
    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={ENLACE}>
      Escríbenos por WhatsApp
    </a>
  )

  switch (resultado.tipo) {
    case "vacio":
      return null
    case "no_disponible":
      return (
        <Aviso titulo="El rastreo no está disponible en este momento.">
          <p>Intenta de nuevo más tarde.</p>
          {enlaceAyuda}
        </Aviso>
      )
    case "limite": {
      const minutos = Math.max(1, Math.ceil(resultado.reintentarEnSegundos / 60))
      return (
        <Aviso titulo="Hiciste muchas búsquedas seguidas.">
          <p>
            Intenta de nuevo en {minutos} {minutos === 1 ? "minuto" : "minutos"}.
          </p>
          {enlaceAyuda}
        </Aviso>
      )
    }
    case "error":
      return (
        <Aviso titulo="No pudimos consultar el rastreo.">
          <p>Puede ser un problema de conexión. Intenta de nuevo en unos minutos.</p>
          <a
            href={`/rastrear?codigo=${encodeURIComponent(codigo)}`}
            className={ENLACE}
          >
            Reintentar
          </a>
        </Aviso>
      )
    case "no_encontrada":
      return (
        <Aviso titulo="No encontramos ese código. Revisa que esté completo (EB-AAMMDD-NNNNN).">
          <p>
            Buscaste <span className="font-mono font-semibold">{codigo}</span>. Un código válido se ve así:{" "}
            <span className="font-mono">{CODIGO_EJEMPLO}</span>.
          </p>
          {enlaceAyuda}
        </Aviso>
      )
    case "encontrada": {
      const e = resultado.encomienda
      const estado = estadoEncomienda(e.estado)
      return (
        <article aria-labelledby="rastreo-titulo" className="rounded-md border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Código de seguimiento</p>
              <h2 id="rastreo-titulo" className="font-mono text-lg font-semibold text-foreground">
                {e.tracking_id}
              </h2>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                CLASES_TONO[estado.tono]
              )}
            >
              {estado.etiqueta}
            </span>
          </div>
          {estado.ayuda && <p className="mt-3 text-sm text-foreground">{estado.ayuda}</p>}

          <dl className="mt-5 grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Ruta</dt>
              <dd className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                {lugar(e.origen)}
                <ArrowRight className="size-3.5" aria-hidden />
                <span className="sr-only">a</span>
                {lugar(e.destino)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cooperativa</dt>
              <dd className="text-sm font-medium text-foreground">{e.cooperativa ?? "Por asignar"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Última actualización</dt>
              <dd className="text-sm font-medium text-foreground tabular-nums">
                {fechaHora(e.actualizada_at ?? e.creada_at) ?? "Sin dato"}
              </dd>
            </div>
          </dl>

          <h3 className="mt-5 mb-4 text-sm font-semibold text-foreground">Recorrido</h3>
          <LineaDeTiempo pasos={construirPasos(e)} />
        </article>
      )
    }
  }
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function RastrearPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const crudo = Array.isArray(params.codigo) ? params.codigo[0] : params.codigo
  const codigo = (crudo ?? "").trim()
  const resultado = codigo ? await rastrearEncomienda(codigo) : null

  return (
    <>
      <Navbar />
      <main className="bg-muted/40 pt-24 pb-20 lg:pt-28">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">Rastrear encomienda</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Escribe el código de seguimiento para ver en qué va tu envío. No necesitas cuenta.
            </p>
          </div>

          <div className="rounded-md border border-border bg-card p-5 sm:p-6">
            <RastreoForm codigoInicial={codigo} />
          </div>

          {resultado && (
            <section aria-live="polite">
              <Resultado resultado={resultado} codigo={normalizarTracking(codigo.slice(0, 40))} />
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
