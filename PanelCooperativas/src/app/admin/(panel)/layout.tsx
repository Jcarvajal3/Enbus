import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { AdminShell } from "@/components/admin-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { verificarSuperAdmin } from "@/lib/data/admin-auth";
import { INICIO } from "@/lib/navigation";
import type { UserProfile } from "@/hooks/use-user";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El layout no se vuelve a renderizar al navegar: cada página y cada función de
  // datos (lib/data/admin-*) verifican también el acceso con requireSuperAdmin().
  const [acceso, tasa, almacen] = await Promise.all([verificarSuperAdmin(), obtenerTasaBCV(), cookies()]);

  if (acceso.estado === "sin_sesion") {
    redirect("/admin/login");
  }
  // Con sesión pero sin rol de super admin (PN-01, sin bucles): un empleado de
  // cooperativa va a su inicio; cualquier otro caso, al login con `motivo`, que cierra
  // la sesión y lo explica (ni el proxy ni el login del admin redirigen de vuelta aquí).
  if (acceso.estado === "sin_permiso") {
    const user = await getUserProfile();
    if (user && (user.role === "admin_cooperativa" || user.role === "taquillero") && user.cooperativa_id) {
      redirect(INICIO);
    }
    redirect("/admin/login?motivo=sin-acceso");
  }

  const user: UserProfile = {
    id: acceso.admin.id,
    role: "super_admin",
    nombre_completo: acceso.admin.nombre_completo,
    cooperativa_id: null,
  };

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
