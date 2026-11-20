import type { Metadata } from "next";

import { Beneficios } from "@/components/sitio/inicio/beneficios";
import { ComoFunciona } from "@/components/sitio/inicio/como-funciona";
import { Descarga } from "@/components/sitio/inicio/descarga";
import { Encomiendas } from "@/components/sitio/inicio/encomiendas";
import { Hero } from "@/components/sitio/inicio/hero";
import { Preguntas } from "@/components/sitio/inicio/preguntas";
import { RutasPopulares } from "@/components/sitio/inicio/rutas";
import { Revelar } from "@/components/sitio/revelar";
import { estadisticas, rutasPopulares, tasaBCV } from "@/lib/sitio/consultas";
import { sitioUrl } from "@/lib/sitio/urls";

const TITULO = "EnBus · Pasajes de bus y encomiendas en Venezuela";
const DESCRIPCION =
  "Compra tu pasaje de bus desde el teléfono, elige tu asiento y paga en bolívares a la tasa BCV. Envía encomiendas con seguimiento y PIN de retiro. Cooperativas verificadas en toda Venezuela.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  openGraph: { title: TITULO, description: DESCRIPCION },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRIPCION },
  ...(sitioUrl() ? { alternates: { canonical: "/" } } : {}),
};

// Regenera la portada cada 30 min (ISR): rutas, cifras y tasa BCV vigentes
// (la tarea programada actualiza la tasa cada 30 min).
export const revalidate = 1800;

/**
 * Portada para el pasajero: qué es EnBus y por qué conviene (portada y beneficios),
 * cómo se compra, rutas reales, encomiendas con rastreo, preguntas y la app.
 * Lo de las cooperativas vive en /cooperativas.
 */
export default async function Portada() {
  // Cada consulta devuelve null/[] sin configuración o ante un error: la portada se adapta.
  const [rutas, tasa, stats] = await Promise.all([rutasPopulares(9), tasaBCV(), estadisticas()]);

  const url = sitioUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "EnBus",
      description: DESCRIPCION,
      areaServed: { "@type": "Country", name: "Venezuela" },
      ...(url ? { url, logo: `${url}/icon.png` } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "EnBus",
      inLanguage: "es-VE",
      ...(url ? { url } : {}),
    },
  ];

  return (
    <>
      <Hero ruta={rutas[0] ?? null} tasa={tasa} stats={stats} />
      <Beneficios />
      <ComoFunciona />
      <RutasPopulares rutas={rutas} tasa={tasa} />
      <Encomiendas tasa={tasa} />
      <Preguntas />
      <Descarga />
      <Revelar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
