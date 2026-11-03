import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, tasa] = await Promise.all([getUserProfile(), obtenerTasaBCV()]);

  // Redirigir si no hay sesión, si el rol no es de cooperativa,
  // o si no tiene cooperativa_id asignada (invariante de diseño).
  if (!user || user.role === "super_admin" || !user.cooperativa_id) {
    redirect("/cooperativas/login");
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TasaBCVProvider tasaInicial={tasa}>
        {/* Tasa del día visible en todas las pantallas: es la que se usa para cobrar en Bs. */}
        <PanelShell user={user} headerExtra={<TasaBCVChip />}>
          {children}
        </PanelShell>
      </TasaBCVProvider>
    </ThemeProvider>
  );
}
