"use client";

import { useUser } from "@/hooks/use-user";
import { ADMIN_NAV_GRUPOS, type ClaveContadorAdmin } from "@/lib/admin-navigation";
import { contadoresAdmin } from "@/lib/data/contadores-menu";
import { etiquetaRol } from "@/lib/estados";
import {
  CabeceraMenu,
  GruposMenu,
  MenuUsuario,
  useContadoresMenu,
  type ConteoItem,
  type ItemBase,
} from "@/components/app-sidebar";
import { Sidebar, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

const SIN_CONTADORES: Record<ClaveContadorAdmin, number> = { solicitudes: 0, incidencias: 0 };

const DESCRIPCION_CONTADOR: Record<ClaveContadorAdmin, (n: number) => string> = {
  solicitudes: (n) => (n === 1 ? "1 solicitud por revisar" : `${n} solicitudes por revisar`),
  incidencias: (n) => (n === 1 ? "1 incidencia abierta" : `${n} incidencias abiertas`),
};

const CLAVE_GRUPOS_ADMIN = "enbus.menu.grupos.admin";

/** Grupos del menú del admin y contadores de cada ítem (menú lateral y barra de pestañas móvil). */
export function useMenuAdmin(): { grupos: typeof ADMIN_NAV_GRUPOS; conteo: (item: ItemBase) => ConteoItem } {
  const contadores = useContadoresMenu(contadoresAdmin, SIN_CONTADORES);

  // `ItemBase` no lleva la clave del contador: se busca el ítem original por su href.
  const conteo = (item: ItemBase): ConteoItem => {
    const clave = ADMIN_NAV_GRUPOS.flatMap((g) => g.items).find((i) => i.href === item.href)?.contador;
    const n = clave ? contadores[clave] : undefined;
    return { n, descripcion: clave && n ? DESCRIPCION_CONTADOR[clave](n) : "" };
  };
  return { grupos: ADMIN_NAV_GRUPOS, conteo };
}

export function AdminSidebar() {
  const { user } = useUser();
  const { conteo } = useMenuAdmin();

  return (
    <Sidebar collapsible="icon">
      {/* Misma marca que el panel de cooperativas: bloque "EB" + zona (AD5-40). */}
      <CabeceraMenu contexto="Administración" />

      <SidebarContent className="px-2">
        <GruposMenu grupos={ADMIN_NAV_GRUPOS} claveStorage={CLAVE_GRUPOS_ADMIN} conteo={conteo} />
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <MenuUsuario nombre={user.nombre_completo} rol={etiquetaRol(user.role)} login="/admin/login" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
