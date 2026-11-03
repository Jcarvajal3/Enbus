import {
  ChartBar, Buildings, CurrencyDollar,
  Receipt, Warning, Users, ClipboardText, Package,
} from "@phosphor-icons/react/dist/ssr";
// Iconos de la entrada SSR: este módulo lo importan el proxy y los Server Components,
// donde la entrada normal (con React context) no se puede evaluar.
import type { Icon } from "@phosphor-icons/react";

// ─── Mapa del panel de administración (fase 5, §2.1) ─────────────────────────
// Mismo texto en el menú, la miga, el H1 y la pestaña del navegador.

/** Contadores del menú del admin (colas de trabajo). */
export type ClaveContadorAdmin = "solicitudes" | "incidencias";

export type AdminNavItem = { title: string; href: string; icon: Icon; contador?: ClaveContadorAdmin };
export type AdminNavGrupo = { titulo?: string; items: AdminNavItem[] };

export const INICIO_ADMIN = "/admin/dashboard";

export const ADMIN_NAV_GRUPOS: AdminNavGrupo[] = [
  { items: [{ title: "Resumen", href: "/admin/dashboard", icon: ChartBar }] },
  {
    titulo: "Por atender",
    items: [
      { title: "Solicitudes", href: "/admin/solicitudes", icon: ClipboardText, contador: "solicitudes" },
      { title: "Incidencias", href: "/admin/incidencias", icon: Warning, contador: "incidencias" },
    ],
  },
  {
    titulo: "Directorio",
    items: [
      { title: "Cooperativas", href: "/admin/cooperativas", icon: Buildings },
      { title: "Usuarios", href: "/admin/usuarios", icon: Users },
      { title: "Encomiendas", href: "/admin/encomiendas", icon: Package },
    ],
  },
  {
    titulo: "Dinero",
    items: [
      { title: "Comisiones", href: "/admin/comisiones", icon: Receipt },
      { title: "Tarifas", href: "/admin/tarifas", icon: CurrencyDollar },
    ],
  },
];

/** @deprecated Usar `ADMIN_NAV_GRUPOS` (se borra en la integración de la fase 5). */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GRUPOS.flatMap((g) => g.items);

/** Sección (y su grupo) del admin a la que pertenece `pathname`, o null fuera del menú. */
export function seccionAdminDe(pathname: string): { grupo?: string; item: AdminNavItem } | null {
  for (const g of ADMIN_NAV_GRUPOS) {
    const item = g.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) return { grupo: g.titulo, item };
  }
  return null;
}
