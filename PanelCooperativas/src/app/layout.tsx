import type { Metadata, Viewport } from "next";
import { Lora } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
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
  themeColor: "#F0A500",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="light scroll-smooth" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className={cn("min-h-full flex flex-col antialiased font-sans", lora.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
