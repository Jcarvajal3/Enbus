"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { UserProvider, type UserProfile } from "@/hooks/use-user";
import { MENU_ABIERTO_DESDE, useAnchoMinimo } from "@/hooks/use-mobile";
import { seccionDe } from "@/lib/navigation";
import { MigaObjetoProvider, useMigaObjeto } from "@/components/miga-objeto";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { EstadoCooperativaBanner } from "@/components/estado-cooperativa-banner";

// ─── Piezas comunes de los dos shells (panel y admin) ────────────────────────

/** Estado del menú: el elegido (cookie `sidebar_state`) o, sin elección, abierto desde 1280 px. */
export function useMenuLateral(menuAbierto: boolean | null) {
  const anchoGrande = useAnchoMinimo(MENU_ABIERTO_DESDE, true);
  const [elegido, setElegido] = useState<boolean | null>(menuAbierto);
  return { open: elegido ?? anchoGrande, onOpenChange: setElegido };
}

/** Primer elemento enfocable de cada shell (WCAG 2.4.1). */
export function SaltarAlContenido() {
  return (
    <a
      href="#contenido"
      className="sr-only rounded-full bg-primary text-sm font-medium text-primary-foreground focus:not-sr-only focus:px-4 focus:py-2 focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      Saltar al contenido
    </a>
  );
}

/**
 * Barra superior (D15). Lista: "Grupo › Sección" (el grupo se oculta < md; sin grupo
 * no hay miga). Detalle (<MigaObjeto>): "Sección › Objeto" con la sección enlazada.
 * La pestaña del navegador ("<Sección> · EnBus") la ponen los `metadata` de cada sección
 * (layout.tsx de su carpeta) con la plantilla "%s · EnBus" del layout raíz.
 */
export function BarraSuperior({
  seccion,
  extra,
}: {
  seccion: { grupo?: string; item: { title: string; href: string } } | null;
  extra?: React.ReactNode;
}) {
  const objeto = useMigaObjeto();

  let miga: React.ReactNode = null;
  if (seccion && objeto) {
    // En teléfono queda solo la sección (enlace de vuelta): el objeto ya es el H1 de la página.
    miga = (
      <>
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbLink
            render={<Link href={seccion.item.href} />}
            className="truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {seccion.item.title}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
          <BreadcrumbPage className="truncate">{objeto}</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    );
  } else if (seccion?.grupo) {
    miga = (
      <>
        <BreadcrumbItem className="hidden md:inline-flex">{seccion.grupo}</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:inline-flex" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{seccion.item.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    );
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:h-16">
      <SidebarTrigger className="-ml-1" />
      {miga && (
        <>
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
          <Breadcrumb aria-label="Ubicación" className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">{miga}</BreadcrumbList>
          </Breadcrumb>
        </>
      )}
      {extra && <div className="ml-auto flex shrink-0 items-center gap-2">{extra}</div>}
    </header>
  );
}

// ─── Shell del panel de cooperativas ─────────────────────────────────────────

export function PanelShell({
  user,
  menuAbierto = null,
  headerExtra,
  children,
}: {
  user: UserProfile;
  /** Estado del menú guardado en la cookie `sidebar_state` (null = sin elegir). */
  menuAbierto?: boolean | null;
  /** Contexto global a la derecha de la barra superior (impresora y tasa BCV). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const menu = useMenuLateral(menuAbierto);

  return (
    <UserProvider initialUser={user}>
      <ServiceWorkerRegistrar />
      <SaltarAlContenido />
      <MigaObjetoProvider>
        <SidebarProvider open={menu.open} onOpenChange={menu.onOpenChange}>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            {/* Conectividad: siempre arriba, sobre la barra */}
            <ConnectivityBanner />
            {/* Estado de la cooperativa (en revisión, rechazada, suspendida o desactivada): no se puede cerrar */}
            <EstadoCooperativaBanner />
            <BarraSuperior seccion={seccionDe(pathname)} extra={headerExtra} />
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
