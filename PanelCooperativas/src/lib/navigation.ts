import {
  ChartBar, Package, Ticket, TruckTrailer,
  MapPin, Users, Gear, CalendarBlank,
  DownloadSimple
} from "@phosphor-icons/react";

export const NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/cooperativas/dashboard",
    icon: ChartBar,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Taquilla Encomiendas",
    href: "/cooperativas/taquilla/encomiendas",
    icon: Package,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Taquilla Boletos",
    href: "/cooperativas/taquilla/boletos",
    icon: Ticket,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Despacho",
    href: "/cooperativas/despacho",
    icon: TruckTrailer,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Recepción Destino",
    href: "/cooperativas/recepcion-destino",
    icon: DownloadSimple,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Rutas y Horarios",
    href: "/cooperativas/rutas",
    icon: MapPin,
    roles: ["admin_cooperativa"],
  },
  {
    title: "Viajes Programados",
    href: "/cooperativas/viajes",
    icon: CalendarBlank,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Gestión Empleados",
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
