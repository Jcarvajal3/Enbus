"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { UserProvider, type UserProfile } from "@/hooks/use-user";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, esRutaActiva } from "@/lib/navigation";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { EstadoCooperativaBanner } from "@/components/estado-cooperativa-banner";

export function PanelShell({
  user,
  headerExtra,
  children,
}: {
  user: UserProfile;
  /** Contenido a la derecha del encabezado (p. ej. la tasa BCV del día). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Mismo nombre en el menú, el breadcrumb y el H1 de cada pantalla.
  const currentItem = NAV_ITEMS.find((item) => esRutaActiva(pathname, item.href));
  const pageTitle = currentItem ? currentItem.title : "Panel";

  return (
    <UserProvider initialUser={user}>
      <ServiceWorkerRegistrar />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Conectividad: siempre arriba, sobre el encabezado */}
          <ConnectivityBanner />
          {/* Estado de la cooperativa (en revisión, rechazada, suspendida o desactivada): no se puede cerrar */}
          <EstadoCooperativaBanner />
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {headerExtra && <div className="ml-auto flex items-center">{headerExtra}</div>}
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </UserProvider>
  );
}
