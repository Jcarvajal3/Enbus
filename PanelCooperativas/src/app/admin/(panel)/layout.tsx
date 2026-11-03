import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import type { Metadata } from "next";

// Prevent search engines from indexing the admin panel
export const metadata: Metadata = {
  title: "Panel de Administración — EnBus",
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, tasa] = await Promise.all([getUserProfile(), obtenerTasaBCV()]);

  // Redirigir a login si no hay sesión o si no es super_admin
  if (!user || user.role !== "super_admin") {
    redirect("/admin/login");
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Tasa BCV de hoy para los montos de referencia en Bs (useTasaBCVAdmin la toma del contexto). */}
      <TasaBCVProvider tasaInicial={tasa}>
        <AdminShell user={user}>{children}</AdminShell>
      </TasaBCVProvider>
    </ThemeProvider>
  );
}
