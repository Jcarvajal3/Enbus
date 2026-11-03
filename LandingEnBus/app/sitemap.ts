import type { MetadataRoute } from "next"

import { RUTAS_LEGALES, sitioUrl } from "@/lib/urls"

const PAGINAS: { ruta: string; frecuencia: "daily" | "monthly" | "yearly"; prioridad: number }[] = [
  { ruta: "/", frecuencia: "daily", prioridad: 1 },
  { ruta: "/rastrear", frecuencia: "monthly", prioridad: 0.8 },
  { ruta: "/registro-cooperativa", frecuencia: "monthly", prioridad: 0.6 },
  { ruta: RUTAS_LEGALES.terminos, frecuencia: "yearly", prioridad: 0.3 },
  { ruta: RUTAS_LEGALES.privacidad, frecuencia: "yearly", prioridad: 0.3 },
  { ruta: RUTAS_LEGALES.eliminarCuenta, frecuencia: "yearly", prioridad: 0.3 },
]

// El sitemap exige URL absolutas: sin NEXT_PUBLIC_SITIO_URL queda vacío (nunca con localhost).
export default function sitemap(): MetadataRoute.Sitemap {
  const sitio = sitioUrl()
  if (!sitio) return []
  return PAGINAS.map((p) => ({
    url: p.ruta === "/" ? sitio : `${sitio}${p.ruta}`,
    changeFrequency: p.frecuencia,
    priority: p.prioridad,
  }))
}
