import type { Metadata } from "next";
import { tituloSeccionAdmin } from "@/lib/admin-navigation";

// Pestaña del navegador: "<Sección> · EnBus" (plantilla "%s · EnBus" del layout superior).
export const metadata: Metadata = { title: tituloSeccionAdmin("/admin/encomiendas") };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
