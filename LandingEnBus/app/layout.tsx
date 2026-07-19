import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"

const roobert = localFont({
  src: "../public/fonts/RoobertVF.ttf",
  variable: "--font-roobert",
  display: "swap",
})

export const metadata: Metadata = {
  title: "EnBus — Envios y Boletos de Bus en Venezuela",
  description:
    "Envia tus paquetes por todo Venezuela de forma segura y economica. Conectamos tu envio con cooperativas de transporte verificadas. Cobertura en mas de 50 ciudades.",
  keywords: [
    "envios Venezuela",
    "encomiendas",
    "paquetes por bus",
    "enviar paquete Venezuela",
    "cooperativas de transporte",
    "EnBus",
  ],
  openGraph: {
    title: "EnBus — Envios y Boletos de Bus en Venezuela",
    description:
      "Envia tus paquetes por todo Venezuela. Cooperativas verificadas, seguimiento en tiempo real y precios transparentes.",
    type: "website",
    locale: "es_VE",
    siteName: "EnBus",
  },
  twitter: {
    card: "summary_large_image",
    title: "EnBus — Envios y Boletos de Bus en Venezuela",
    description:
      "Envia tus paquetes por todo Venezuela. Cooperativas verificadas, seguimiento en tiempo real.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${roobert.variable} font-sans antialiased`}>
      <body>{children}</body>
    </html>
  )
}
