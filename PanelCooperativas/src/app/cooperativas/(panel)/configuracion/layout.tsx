import type { Metadata } from "next";
import { tituloSeccion } from "@/lib/navigation";

// Pestaña del navegador: "<Sección> · EnBus" (plantilla "%s · EnBus" del layout superior).
export const metadata: Metadata = { title: tituloSeccion("/cooperativas/configuracion") };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
