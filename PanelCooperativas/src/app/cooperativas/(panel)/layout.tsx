import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { ThemeProvider } from "@/components/theme-provider";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserProfile();

  // Redirigir si no hay sesión, si el rol no es de cooperativa,
  // o si no tiene cooperativa_id asignada (invariante de diseño).
  if (!user || user.role === "super_admin" || !user.cooperativa_id) {
    redirect("/cooperativas/login");
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <PanelShell user={user}>{children}</PanelShell>
    </ThemeProvider>
  );
}
