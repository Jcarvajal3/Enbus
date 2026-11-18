"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar, useMenuAdmin } from "@/components/admin-sidebar";
import { BarraSuperior, CLASE_MAIN_MOVIL, SaltarAlContenido, useMenuLateral } from "@/components/panel-shell";
import { BarraPestanas } from "@/components/movil/barra-pestanas";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";
import { useIsMobile } from "@/hooks/use-mobile";
import { etiquetaRol } from "@/lib/estados";
import { cn } from "@/lib/utils";
import { MigaObjetoProvider } from "@/components/miga-objeto";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UserProvider, useUser, type UserProfile } from "@/hooks/use-user";
import { seccionAdminDe } from "@/lib/admin-navigation";

function CabeceraMovilAdmin({ headerExtra }: { headerExtra?: React.ReactNode }) {
  const { user } = useUser();
  return (
    <CabeceraMovil
      seccion={seccionAdminDe(usePathname())}
      extra={headerExtra}
      nombre={user.nombre_completo}
      rol={etiquetaRol(user.role)}
      login="/admin/login"
    />
  );
}

function BarraPestanasAdmin() {
  const { grupos, conteo } = useMenuAdmin();
  return <BarraPestanas grupos={grupos} conteo={conteo} />;
}

// Mismo shell que el panel de cooperativas (D15): barra "Grupo › Sección" o
// "Sección › Objeto" (con <MigaObjeto>), tasa BCV a la derecha (sin impresora).
export function AdminShell({
  user,
  menuAbierto = null,
  headerExtra,
  children,
}: {
  user: UserProfile;
  /** Estado del menú guardado en la cookie `sidebar_state` (null = sin elegir). */
  menuAbierto?: boolean | null;
  /** Contexto global a la derecha de la barra superior (tasa BCV). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const menu = useMenuLateral(menuAbierto);
  const movil = useIsMobile();

  return (
    <UserProvider initialUser={user}>
      <SaltarAlContenido />
      <MigaObjetoProvider>
        <SidebarProvider open={menu.open} onOpenChange={menu.onOpenChange}>
          {!movil && <AdminSidebar />}
          <SidebarInset className={cn("min-w-0 bg-canvas", CLASE_MAIN_MOVIL)}>
            <ConnectivityBanner />
            {movil ? <CabeceraMovilAdmin headerExtra={headerExtra} /> : <BarraSuperior seccion={seccionAdminDe(pathname)} extra={headerExtra} />}
            {/* SidebarInset ya es el <main>: el destino de "Saltar al contenido" es este bloque. */}
            <div id="contenido" tabIndex={-1} className="flex min-w-0 flex-1 flex-col p-5 outline-none lg:p-8">
              {children}
            </div>
          </SidebarInset>
          {movil && <BarraPestanasAdmin />}
        </SidebarProvider>
      </MigaObjetoProvider>
    </UserProvider>
  );
}
