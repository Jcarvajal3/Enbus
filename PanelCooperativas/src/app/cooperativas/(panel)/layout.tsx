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

  // Sin perfil, con un rol que no es del panel o sin cooperativa_id (invariante de
  // diseño): al login con el motivo. El login no redirige de vuelta aquí si la
  // cuenta no tiene acceso (antes eso era un bucle de redirecciones).
  if (!user) redirect("/cooperativas/login?error=sin-acceso");
  if (user.role === "super_admin") redirect("/admin/dashboard");
  if ((user.role !== "admin_cooperativa" && user.role !== "taquillero") || !user.cooperativa_id) {
    redirect("/cooperativas/login?error=sin-acceso");
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
