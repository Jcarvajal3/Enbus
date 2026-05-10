import type { Metadata, Viewport } from "next";
import { Lora } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
});

export const metadata: Metadata = {
  title: {
    default: "Panel Cooperativas | EnBus",
    template: "%s | EnBus Panel",
  },
  description: "Panel de gestión operativa para cooperativas de transporte EnBus",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn("min-h-full flex flex-col antialiased font-sans", lora.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
