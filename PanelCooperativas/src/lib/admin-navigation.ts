import {
  ChartBar, Buildings, CurrencyDollar,
  Receipt, Warning, Users, ClipboardText
} from "@phosphor-icons/react";

export const ADMIN_NAV_ITEMS = [
  { title: "Dashboard",    href: "/admin/dashboard",    icon: ChartBar },
  { title: "Solicitudes",  href: "/admin/solicitudes",  icon: ClipboardText },
  { title: "Cooperativas", href: "/admin/cooperativas", icon: Buildings },
  { title: "Tarifas",      href: "/admin/tarifas",      icon: CurrencyDollar },
  { title: "Comisiones",   href: "/admin/comisiones",   icon: Receipt },
  { title: "Incidencias",  href: "/admin/incidencias",  icon: Warning },
  { title: "Usuarios",     href: "/admin/usuarios",     icon: Users },
];
