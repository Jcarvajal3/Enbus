import type { Metadata } from "next";

import { Cooperativas } from "@/components/sitio/cooperativas";
import { Encomiendas } from "@/components/sitio/encomiendas";
import { Itinerario } from "@/components/sitio/itinerario";
import { PasePortada } from "@/components/sitio/pase-portada";
import { Preguntas } from "@/components/sitio/preguntas";
import { Rastreo } from "@/components/sitio/rastreo";
import { Revelar } from "@/components/sitio/revelar";
import { Rutas } from "@/components/sitio/rutas";
import { rutasPopulares, tasaBCV } from "@/lib/sitio/consultas";
import { sitioUrl } from "@/lib/sitio/urls";

const DESCRIPCION =
  "Compra boletos de bus, elige tu asiento y envía encomiendas con cooperativas verificadas de toda Venezuela. Pagas en bolívares a la tasa BCV.";

export const metadata: Metadata = {
  title: { absolute: "EnBus · Boletos de bus y encomiendas en Venezuela" },
  description: DESCRIPCION,
  openGraph: { title: "EnBus · Boletos de bus y encomiendas en Venezuela", description: DESCRIPCION },
  ...(sitioUrl() ? { alternates: { canonical: "/" } } : {}),
};

// Regenera la portada cada 30 min (ISR): rutas y tasa BCV vigentes
// (la tarea programada actualiza la tasa cada 30 min).
export const revalidate = 1800;

export default async function Portada() {
  // Cada consulta devuelve null/[] sin configuración o ante un error: la portada se adapta.
  const [rutas, tasa] = await Promise.all([rutasPopulares(8), tasaBCV()]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "EnBus",
    description: DESCRIPCION,
    areaServed: { "@type": "Country", name: "Venezuela" },
    ...(sitioUrl() ? { url: sitioUrl() } : {}),
  };

  return (
    <>
      <PasePortada ruta={rutas[0] ?? null} tasa={tasa} />
      <Rutas rutas={rutas} tasa={tasa} />
      <Itinerario />
      <Encomiendas tasa={tasa} />
      <Rastreo />
      <Cooperativas />
      <Preguntas />
      <Revelar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
