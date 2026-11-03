import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"

import { correoSoporte, numeroSoporteWhatsApp, sitioUrl } from "@/lib/urls"

const roobert = localFont({
  src: "../public/fonts/RoobertVF.ttf",
  variable: "--font-roobert",
  display: "swap",
})

const TITULO = "Boletos de bus y encomiendas en Venezuela · EnBus"
const DESCRIPCION =
  "Compra tu pasaje de bus o envía tu encomienda por toda Venezuela con cooperativas verificadas. Paga con Pago Móvil o transferencia y sigue tu viaje o tu envío."

// Sin NEXT_PUBLIC_SITIO_URL no hay metadataBase: Next resuelve la imagen OG con su URL por defecto
// y el canonical de cada página se omite (nunca se publica localhost como URL canónica).
const SITIO = sitioUrl()

export const metadata: Metadata = {
  ...(SITIO ? { metadataBase: new URL(SITIO) } : {}),
  title: {
    default: TITULO,
    template: "%s · EnBus",
  },
  description: DESCRIPCION,
  keywords: [
    "boletos de bus Venezuela",
    "pasajes de autobús",
    "encomiendas Venezuela",
    "envíos por bus",
    "rastrear encomienda",
    "cooperativas de transporte",
    "EnBus",
  ],
  openGraph: {
    title: TITULO,
    description:
      "Boletos de bus y encomiendas por toda Venezuela, en un solo lugar. Cooperativas verificadas, pago con Pago Móvil o transferencia y rastreo con código de seguimiento.",
    type: "website",
    locale: "es_VE",
    siteName: "EnBus",
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: "Compra tu pasaje o envía tu paquete con cooperativas verificadas en toda Venezuela.",
  },
}

/** Datos estructurados de la organización (JSON-LD), con los canales de soporte configurados. */
function organizacionJsonLd(): string {
  const whatsapp = numeroSoporteWhatsApp()
  const correo = correoSoporte()
  const contacto =
    whatsapp || correo
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            availableLanguage: "es",
            areaServed: "VE",
            ...(whatsapp ? { telephone: `+${whatsapp}` } : {}),
            ...(correo ? { email: correo } : {}),
          },
        }
      : {}
  const datos = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "EnBus",
    description: DESCRIPCION,
    areaServed: { "@type": "Country", name: "Venezuela" },
    ...(SITIO ? { url: SITIO } : {}),
    ...contacto,
  }
  // "<" escapado para que el JSON no pueda cerrar la etiqueta <script> (guía JSON-LD de Next).
  return JSON.stringify(datos).replace(/</g, "\\u003c")
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-VE" className={`${roobert.variable} font-sans antialiased`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizacionJsonLd() }} />
        {children}
      </body>
    </html>
  )
}
