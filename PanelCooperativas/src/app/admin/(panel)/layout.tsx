import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { SinAccesoAdmin } from "@/components/admin/sin-acceso";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { verificarSuperAdmin } from "@/lib/data/admin-auth";
import type { UserProfile } from "@/hooks/use-user";
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
  // El layout no se vuelve a renderizar al navegar: cada página y cada función de
  // datos (lib/data/admin-*) verifican también el acceso con requireSuperAdmin().
  const [acceso, tasa] = await Promise.all([verificarSuperAdmin(), obtenerTasaBCV()]);

  if (acceso.estado === "sin_sesion") {
    redirect("/admin/login");
  }
  // Con sesión pero sin rol de super admin: redirigir al login haría un bucle
  // (el proxy manda del login con sesión al resumen). Se explica y se ofrece salir.
  if (acceso.estado === "sin_permiso") {
    return <SinAccesoAdmin />;
  }

  const user: UserProfile = {
    id: acceso.admin.id,
    role: "super_admin",
    nombre_completo: acceso.admin.nombre_completo,
    cooperativa_id: null,
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Tasa BCV de hoy para los montos de referencia en Bs (useTasaBCVAdmin la toma del contexto). */}
      <TasaBCVProvider tasaInicial={tasa}>
        <AdminShell user={user}>{children}</AdminShell>
      </TasaBCVProvider>
    </ThemeProvider>
  );
}
