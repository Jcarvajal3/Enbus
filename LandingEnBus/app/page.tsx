import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { HowItWorks } from "@/components/how-it-works"
import { Benefits } from "@/components/benefits"
import { PopularRoutes } from "@/components/popular-routes"
import { CalculatorCTA } from "@/components/calculator-cta"
import { AppDownload } from "@/components/app-download"
import { CooperativaCTA } from "@/components/cooperativa-cta"
import { Footer } from "@/components/footer"
import { estadisticas, origenesConDestinos, rutasPopulares, tasaBCV } from "@/lib/consultas"

// Regenera la portada cada 30 min (ISR): rutas, cifras y tasa BCV vigentes
// (la tarea programada actualiza la tasa cada 30 min).
export const revalidate = 1800

export default async function Home() {
  // Cada consulta devuelve null/[] sin configuración o ante un error: la sección se oculta.
  const [stats, rutas, tasa, origenes] = await Promise.all([
    estadisticas(),
    rutasPopulares(6),
    tasaBCV(),
    origenesConDestinos(),
  ])

  // Sin estadísticas, las RPC públicas de la fase 3 no responden (p. ej. migración sin aplicar):
  // la calculadora usa fn_cotizar_envio_publico, así que también se oculta.
  const origenesCalculadora = stats ? origenes : []
  const secciones = { rutas: rutas.length > 0, calcular: origenesCalculadora.length > 0 }

  return (
    <>
      <Navbar secciones={secciones} />
      <main>
        <Hero estadisticas={stats} calculadora={secciones.calcular} />
        <HowItWorks />
        <Benefits estadisticas={stats} />
        <PopularRoutes rutas={rutas} tasa={tasa} />
        <CalculatorCTA origenes={origenesCalculadora} />
        {/* Testimonios: fuera hasta tener reseñas reales (L-05) */}
        <AppDownload />
        <CooperativaCTA />
      </main>
      <Footer secciones={secciones} />
    </>
  )
}
