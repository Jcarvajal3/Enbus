import {
  ChartBar, Buildings, CurrencyDollar,
  Receipt, Warning, Users, ClipboardText, Package,
} from "@phosphor-icons/react";

// Mismo texto en el menú, el H1 y el breadcrumb (glosario, Audits/fase3_spec.md §4).
export const ADMIN_NAV_ITEMS = [
  { title: "Resumen",           href: "/admin/dashboard",    icon: ChartBar },
  { title: "Solicitudes",       href: "/admin/solicitudes",  icon: ClipboardText },
  { title: "Cooperativas",      href: "/admin/cooperativas", icon: Buildings },
  { title: "Buscar encomienda", href: "/admin/encomiendas",  icon: Package },
  { title: "Tarifas",           href: "/admin/tarifas",      icon: CurrencyDollar },
  { title: "Comisiones",        href: "/admin/comisiones",   icon: Receipt },
  { title: "Incidencias",       href: "/admin/incidencias",  icon: Warning },
  { title: "Usuarios",          href: "/admin/usuarios",     icon: Users },
];
