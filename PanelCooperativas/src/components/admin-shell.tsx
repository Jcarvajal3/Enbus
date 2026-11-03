"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BarraSuperior, SaltarAlContenido, useMenuLateral } from "@/components/panel-shell";
import { MigaObjetoProvider } from "@/components/miga-objeto";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UserProvider, type UserProfile } from "@/hooks/use-user";
import { seccionAdminDe } from "@/lib/admin-navigation";

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

  return (
    <UserProvider initialUser={user}>
      <SaltarAlContenido />
      <MigaObjetoProvider>
        <SidebarProvider open={menu.open} onOpenChange={menu.onOpenChange}>
          <AdminSidebar />
          <SidebarInset className="min-w-0">
            <ConnectivityBanner />
            <BarraSuperior
              seccion={seccionAdminDe(pathname)}
              tituloPorDefecto="Administración · EnBus"
              extra={headerExtra}
            />
            {/* SidebarInset ya es el <main>: el destino de "Saltar al contenido" es este bloque. */}
            <div id="contenido" tabIndex={-1} className="flex min-w-0 flex-1 flex-col p-4 outline-none sm:p-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </MigaObjetoProvider>
    </UserProvider>
  );
}
