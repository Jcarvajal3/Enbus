import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"

const roobert = localFont({
  src: "../public/fonts/RoobertVF.ttf",
  variable: "--font-roobert",
  display: "swap",
})

const TITULO = "EnBus — Boletos de bus y encomiendas en Venezuela"
const DESCRIPCION =
  "Compra tu pasaje de bus o envía tu encomienda por toda Venezuela con cooperativas verificadas. Paga con Pago Móvil o transferencia y sigue tu viaje o tu envío."

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-VE" className={`${roobert.variable} font-sans antialiased`}>
      <body>{children}</body>
    </html>
  )
}
