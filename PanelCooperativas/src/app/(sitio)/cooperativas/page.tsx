import type { Metadata } from "next";

import { Beneficios } from "@/components/sitio/para-cooperativas/beneficios";
import { Cierre } from "@/components/sitio/para-cooperativas/cierre";
import { Dinero } from "@/components/sitio/para-cooperativas/dinero";
import { Hero } from "@/components/sitio/para-cooperativas/hero";
import { Modulos } from "@/components/sitio/para-cooperativas/modulos";
import { Pasos } from "@/components/sitio/para-cooperativas/pasos";
import { PREGUNTAS_COOPERATIVAS, Preguntas } from "@/components/sitio/para-cooperativas/preguntas";
import { Revelar } from "@/components/sitio/revelar";
import { RUTAS_SITIO, sitioUrl } from "@/lib/sitio/urls";

const TITULO = "EnBus para cooperativas · Vende pasajes y encomiendas en línea";
const DESCRIPCION =
  "Vende pasajes y encomiendas en la app de EnBus y en tu taquilla, con un solo mapa de asientos. Verifica los pagos, despacha y embarca desde un panel. Registrarse no tiene costo.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  openGraph: { title: TITULO, description: DESCRIPCION, type: "website" },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRIPCION },
  ...(sitioUrl() ? { alternates: { canonical: RUTAS_SITIO.cooperativas } } : {}),
};

/** Página B2B: capta cooperativas de transporte. El resto de /cooperativas/* es el panel. */
export default function PaginaCooperativas() {
  const url = sitioUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: TITULO,
      description: DESCRIPCION,
      inLanguage: "es-VE",
      ...(url ? { url: `${url}${RUTAS_SITIO.cooperativas}` } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PREGUNTAS_COOPERATIVAS.map((p) => ({
        "@type": "Question",
        name: p.pregunta,
        acceptedAnswer: { "@type": "Answer", text: p.respuesta },
      })),
    },
  ];

  return (
    <>
      <Hero />
      <Beneficios />
      <Modulos />
      <Pasos />
      <Dinero />
      <Preguntas />
      <Cierre />
      <Revelar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
