import {
  ChartBar, Package, Ticket, TruckTrailer,
  MapPin, Users, Gear, CalendarBlank,
  DownloadSimple, Handshake, Receipt, ArrowCounterClockwise,
  type Icon,
} from "@phosphor-icons/react";

export type RolPanel = "admin_cooperativa" | "taquillero";

export type NavItem = {
  /** Mismo texto en el menú, el H1 y el breadcrumb (glosario, Audits/fase3_spec.md §4). */
  title: string;
  href: string;
  icon: Icon;
  roles: RolPanel[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Resumen",
    href: "/cooperativas/dashboard",
    icon: ChartBar,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Taquilla de boletos",
    href: "/cooperativas/taquilla/boletos",
    icon: Ticket,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Taquilla de encomiendas",
    href: "/cooperativas/taquilla/encomiendas",
    icon: Package,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Pagos por verificar",
    href: "/cooperativas/pagos",
    icon: Receipt,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Reembolsos",
    href: "/cooperativas/reembolsos",
    icon: ArrowCounterClockwise,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Despacho",
    href: "/cooperativas/despacho",
    icon: TruckTrailer,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Recepción en destino",
    href: "/cooperativas/recepcion-destino",
    icon: DownloadSimple,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Entrega",
    href: "/cooperativas/entrega",
    icon: Handshake,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Rutas",
    href: "/cooperativas/rutas",
    icon: MapPin,
    roles: ["admin_cooperativa"],
  },
  {
    title: "Viajes",
    href: "/cooperativas/viajes",
    icon: CalendarBlank,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Empleados",
    href: "/cooperativas/empleados",
    icon: Users,
    roles: ["admin_cooperativa"],
  },
  {
    title: "Configuración",
    href: "/cooperativas/configuracion",
    icon: Gear,
    roles: ["admin_cooperativa"],
  },
];

/** true si `pathname` está dentro de la sección `href` (la sección y sus subrutas). */
export function esRutaActiva(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}
