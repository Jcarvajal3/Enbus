import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { AdminShell } from "@/components/admin-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { INICIO } from "@/lib/navigation";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, tasa, almacen] = await Promise.all([getUserProfile(), obtenerTasaBCV(), cookies()]);

  // Mismo criterio que el panel de cooperativas (PN-01): sin bucles. Un empleado de
  // cooperativa va a su inicio; cualquier otro caso, al login con `motivo`.
  if (user && (user.role === "admin_cooperativa" || user.role === "taquillero") && user.cooperativa_id) {
    redirect(INICIO);
  }
  if (!user || user.role !== "super_admin") {
    redirect("/admin/login?motivo=sin-acceso");
  }

  const estadoMenu = almacen.get("sidebar_state")?.value;
  const menuAbierto = estadoMenu === "true" ? true : estadoMenu === "false" ? false : null;

  return (
    // Tasa BCV de hoy para los montos de referencia en Bs (useTasaBCVAdmin la toma del contexto).
    <TasaBCVProvider tasaInicial={tasa}>
      <AdminShell user={user} menuAbierto={menuAbierto} headerExtra={<TasaBCVChip href="/admin/tarifas#tasa-bcv" />}>
        {children}
      </AdminShell>
    </TasaBCVProvider>
  );
}
