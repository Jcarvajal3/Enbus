import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { PanelShell } from "@/components/panel-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { ImpresoraChip } from "@/components/impresora-chip";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, tasa, almacen] = await Promise.all([getUserProfile(), obtenerTasaBCV(), cookies()]);

  // PN-01: sin perfil, con un rol que no es del panel o sin cooperativa_id (invariante
  // de diseño): al login con el motivo, que cierra la sesión y lo explica. Ni el proxy
  // ni el login redirigen de vuelta aquí a una cuenta sin acceso (antes eso era un
  // bucle de redirecciones). El super_admin va a su panel.
  if (!user) redirect("/cooperativas/login?motivo=sin-acceso");
  if (user.role === "super_admin") redirect(INICIO_ADMIN);
  if ((user.role !== "admin_cooperativa" && user.role !== "taquillero") || !user.cooperativa_id) {
    redirect("/cooperativas/login?motivo=sin-acceso");
  }

  // Menú: el último estado elegido (cookie del sidebar); sin cookie decide el ancho (< 1280 px plegado).
  const estadoMenu = almacen.get("sidebar_state")?.value;
  const menuAbierto = estadoMenu === "true" ? true : estadoMenu === "false" ? false : null;

  return (
    <TasaBCVProvider tasaInicial={tasa}>
      {/* Contexto global en la barra superior: tasa del día (con la que se cobra en Bs) e impresora. */}
      <PanelShell
        user={user}
        menuAbierto={menuAbierto}
        headerExtra={
          <>
            <ImpresoraChip />
            <TasaBCVChip />
          </>
        }
      >
        {children}
      </PanelShell>
    </TasaBCVProvider>
  );
}
