"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { ADMIN_NAV_GRUPOS, type AdminNavItem, type ClaveContadorAdmin } from "@/lib/admin-navigation";
import { contadoresAdmin } from "@/lib/data/contadores-menu";
import { etiquetaRol } from "@/lib/estados";
import { BrandMark } from "@/components/brand-mark";
import { ContadorMenu, MenuUsuario, PuntoContador, useContadoresMenu } from "@/components/app-sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const SIN_CONTADORES: Record<ClaveContadorAdmin, number> = { solicitudes: 0, incidencias: 0 };

const DESCRIPCION_CONTADOR: Record<ClaveContadorAdmin, (n: number) => string> = {
  solicitudes: (n) => (n === 1 ? "1 solicitud por revisar" : `${n} solicitudes por revisar`),
  incidencias: (n) => (n === 1 ? "1 incidencia abierta" : `${n} incidencias abiertas`),
};

function esActiva(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ItemMenuAdmin({
  item,
  pathname,
  contadores,
}: {
  item: AdminNavItem;
  pathname: string;
  contadores: Record<ClaveContadorAdmin, number>;
}) {
  const activo = esActiva(pathname, item.href);
  const n = item.contador ? contadores[item.contador] : undefined;
  const descripcion = item.contador && n ? DESCRIPCION_CONTADOR[item.contador](n) : "";
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} aria-current={activo ? "page" : undefined} />}
        isActive={activo}
        tooltip={descripcion ? `${item.title} · ${descripcion}` : item.title}
        className="relative"
      >
        <item.icon aria-hidden />
        <PuntoContador n={n} />
        <span>
          {item.title}
          {descripcion && <span className="sr-only">{` (${descripcion})`}</span>}
        </span>
      </SidebarMenuButton>
      <ContadorMenu n={n} activo={activo} descripcion={descripcion} />
    </SidebarMenuItem>
  );
}

export function AdminSidebar() {
  const { user } = useUser();
  const pathname = usePathname();
  const contadores = useContadoresMenu(contadoresAdmin, SIN_CONTADORES);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        {/* Misma marca que el panel de cooperativas: bloque "EB" + zona (AD5-40). */}
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark tamano="sm" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">EnBus</span>
            <span className="truncate text-xs text-muted-foreground">Administración</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {ADMIN_NAV_GRUPOS.map((grupo, i) => (
          <SidebarGroup key={grupo.titulo ?? `grupo-${i}`} className="py-1">
            {grupo.titulo && <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.items.map((item) => (
                  <ItemMenuAdmin key={item.href} item={item} pathname={pathname} contadores={contadores} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <MenuUsuario nombre={user.nombre_completo} rol={etiquetaRol(user.role)} login="/admin/login" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
