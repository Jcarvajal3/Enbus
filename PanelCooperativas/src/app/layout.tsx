import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const roobert = localFont({
  src: "../../public/fonts/RoobertVF.ttf",
  variable: "--font-roobert",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EnBus — Envios seguros por toda Venezuela",
    template: "%s | EnBus",
  },
  description: "Conectamos tu envio con cooperativas de transporte verificadas. Cobertura en mas de 50 ciudades con seguimiento en tiempo real.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#FFC757",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="light scroll-smooth" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className={cn("min-h-full flex flex-col antialiased font-sans", roobert.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
