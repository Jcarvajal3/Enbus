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
      className="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      Saltar al contenido
    </a>
  );
}

/**
 * Barra superior (D15). Lista: "Grupo › Sección" (el grupo se oculta < md; sin grupo
 * no hay miga). Detalle (<MigaObjeto>): "Sección › Objeto" con la sección enlazada.
 * También pone la pestaña del navegador: "<Sección> · EnBus".
 */
export function BarraSuperior({
  seccion,
  tituloPorDefecto,
  extra,
}: {
  seccion: { grupo?: string; item: { title: string; href: string } } | null;
  tituloPorDefecto: string;
  extra?: React.ReactNode;
}) {
  const objeto = useMigaObjeto();
  const titulo = seccion ? `${seccion.item.title} · EnBus` : tituloPorDefecto;

  let miga: React.ReactNode = null;
  if (seccion && objeto) {
    miga = (
      <>
        <BreadcrumbItem className="min-w-0 shrink-0">
          <BreadcrumbLink
            render={<Link href={seccion.item.href} />}
            className="truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {seccion.item.title}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
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
      <title>{titulo}</title>
      <SidebarTrigger className="-ml-1" />
      {miga && (
        <>
          <Separator orientation="vertical" className="mr-1 h-4" />
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
            <BarraSuperior
              seccion={seccionDe(pathname)}
              tituloPorDefecto="Panel de cooperativas · EnBus"
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
