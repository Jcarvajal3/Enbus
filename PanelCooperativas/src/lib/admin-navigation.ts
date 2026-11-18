import {
  ChartBar, Buildings, CurrencyDollar,
  Receipt, Warning, Users, ClipboardText, Package, Briefcase, ListChecks,
} from "@phosphor-icons/react/dist/ssr";
// Iconos de la entrada SSR: este módulo lo importan el proxy y los Server Components,
// donde la entrada normal (con React context) no se puede evaluar.
import type { Icon } from "@phosphor-icons/react";

// ─── Mapa del panel de administración (fase 5, §2.1) ─────────────────────────
// Mismo texto en el menú, la miga, el H1 y la pestaña del navegador.

/** Contadores del menú del admin (colas de trabajo). */
export type ClaveContadorAdmin = "solicitudes" | "incidencias";

export type AdminNavItem = { title: string; href: string; icon: Icon; contador?: ClaveContadorAdmin };
/** `directo`: enlace suelto (un ítem, sin plegar y sin grupo en la miga). */
export type AdminNavGrupo = { id: string; titulo: string; icon: Icon; directo?: boolean; items: AdminNavItem[] };

export const INICIO_ADMIN = "/admin/dashboard";

/** Mismo patrón que el panel de cooperativas: Resumen, dos grupos plegables y Usuarios. */
export const ADMIN_NAV_GRUPOS: AdminNavGrupo[] = [
  {
    id: "resumen",
    titulo: "Resumen",
    icon: ChartBar,
    directo: true,
    items: [{ title: "Resumen", href: "/admin/dashboard", icon: ChartBar }],
  },
  {
    id: "cooperativas",
    titulo: "Cooperativas",
    icon: Briefcase,
    items: [
      { title: "Solicitudes", href: "/admin/solicitudes", icon: ClipboardText, contador: "solicitudes" },
      { title: "Cooperativas", href: "/admin/cooperativas", icon: Buildings },
      { title: "Comisiones", href: "/admin/comisiones", icon: Receipt },
      { title: "Tarifas", href: "/admin/tarifas", icon: CurrencyDollar },
    ],
  },
  {
    id: "operacion",
    titulo: "Operación",
    icon: ListChecks,
    items: [
      { title: "Encomiendas", href: "/admin/encomiendas", icon: Package },
      { title: "Incidencias", href: "/admin/incidencias", icon: Warning, contador: "incidencias" },
    ],
  },
  {
    id: "usuarios",
    titulo: "Usuarios",
    icon: Users,
    directo: true,
    items: [{ title: "Usuarios", href: "/admin/usuarios", icon: Users }],
  },
];

/** Sección (y su grupo) del admin a la que pertenece `pathname`, o null fuera del menú. */
export function seccionAdminDe(pathname: string): { grupo?: string; item: AdminNavItem } | null {
  for (const g of ADMIN_NAV_GRUPOS) {
    const item = g.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) return { grupo: g.directo ? undefined : g.titulo, item };
  }
  return null;
}

/** Nombre de la sección del admin con ese `href` (para `metadata.title` de su layout). */
export function tituloSeccionAdmin(href: string): string {
  const item = ADMIN_NAV_GRUPOS.flatMap((g) => g.items).find((i) => i.href === href);
  if (!item) throw new Error(`Sección desconocida: ${href}`);
  return item.title;
}
