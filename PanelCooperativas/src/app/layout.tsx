import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const roobert = localFont({
  src: "../../public/fonts/RoobertVF.ttf",
  variable: "--font-roobert",
  display: "swap",
});

// Pestaña del navegador: "<Sección> · EnBus" (SY-19). Cada sección la pone con el
// `metadata.title` de su layout.tsx (nombre de `lib/navigation`); el admin tiene su propio valor por defecto.
export const metadata: Metadata = {
  title: {
    default: "Panel de cooperativas · EnBus",
    template: "%s · EnBus",
  },
  description: "Panel de EnBus para cooperativas de transporte: taquilla, encomiendas, despacho y viajes.",
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
    <html lang="es" className="motion-safe:scroll-smooth" suppressHydrationWarning>
      <body className={cn("min-h-full flex flex-col bg-background text-foreground antialiased font-sans", roobert.variable)}>
        {/* Un solo proveedor de tema (D14): panel, admin y pantallas públicas siguen el tema elegido. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
