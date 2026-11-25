import type { Metadata } from "next";

import { Descarga } from "@/components/sitio/inicio/descarga";
import { Encomiendas } from "@/components/sitio/inicio/encomiendas";
import { Hero } from "@/components/sitio/inicio/hero";
import { Preguntas } from "@/components/sitio/inicio/preguntas";
import { ProximasSalidas } from "@/components/sitio/inicio/proximas-salidas";
import { RutasPopulares } from "@/components/sitio/inicio/rutas";
import { Revelar } from "@/components/sitio/revelar";
import { ciudadesConSalidas, proximasSalidas } from "@/lib/pasajero/viajes";
import { rutasPopulares, tasaBCV } from "@/lib/sitio/consultas";
import { sitioUrl } from "@/lib/sitio/urls";

const TITULO = "EnBus · Pasajes de bus y encomiendas en Venezuela";
const DESCRIPCION =
  "Busca pasajes de bus por ciudad y fecha, elige tu asiento y paga en bolívares a la tasa BCV. Cotiza y envía encomiendas con seguimiento. Cooperativas verificadas en toda Venezuela.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  openGraph: { title: TITULO, description: DESCRIPCION },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRIPCION },
  ...(sitioUrl() ? { alternates: { canonical: "/" } } : {}),
};

// Regenera la portada cada 2 min (ISR): salidas, rutas y tasa BCV vigentes. Sin sesión ni cookies:
// el menú de la cuenta vive en la barra (cliente), así la portada sigue siendo estática.
export const revalidate = 120;

/**
 * Portada para el pasajero: buscador de pasajes y encomiendas arriba, próximas salidas reales,
 * rutas populares, rastreo, preguntas y la app. Lo de las cooperativas vive en /cooperativas.
 */
export default async function Portada() {
  // Cada consulta devuelve null/[] sin configuración o ante un error: la portada se adapta.
  const [ciudades, salidas, rutas, tasa] = await Promise.all([
    ciudadesConSalidas(),
    proximasSalidas({ limite: 24 }),
    rutasPopulares(9),
    tasaBCV(),
  ]);

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
      <Hero ciudades={ciudades} tasa={tasa} />
      <ProximasSalidas viajes={salidas} tasa={tasa} />
      <RutasPopulares rutas={rutas} tasa={tasa} />
      <Encomiendas tasa={tasa} />
      <Preguntas />
      <Descarga />
      <Revelar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
