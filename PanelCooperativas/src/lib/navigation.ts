import {
  ChartBar, Package, Ticket, TruckTrailer,
  MapTrifold, Users, Gear, CalendarBlank,
  DownloadSimple, Handshake, Receipt, ArrowCounterClockwise, Printer,
  Bus, QrCode,
  type Icon,
} from "@phosphor-icons/react/dist/ssr";

// ─── Mapa del panel de cooperativas (fase 5, §2.1) ───────────────────────────
// Una sola fuente para el menú, la miga de la barra superior, la pestaña del
// navegador y los iconos de cada sección. El nombre de una sección es el mismo
// en el menú, la miga, el H1 y el <title> ("<Sección> · EnBus").

export type RolPanel = "admin_cooperativa" | "taquillero";

/** Inicio del panel para ambos roles (PN-04): login, invitación, 404, error y `/cooperativas`. */
export const INICIO = "/cooperativas/dashboard";

/** Claves de `fn_bandeja_cooperativa()` que se cuentan en el menú. */
export type ClaveContador =
  | "pagos_por_verificar"
  | "reembolsos_por_devolver"
  | "encomiendas_en_camino"
  | "encomiendas_por_vencer";

export type NavItem = {
  /** Mismo texto en el menú, la miga, el H1 y la pestaña del navegador. */
  title: string;
  href: string;
  icon: Icon;
  roles: RolPanel[];
  contador?: ClaveContador;
  tonoContador?: "neutro" | "aviso";
};

export type NavGrupo = { titulo?: string; items: NavItem[] };

/** Un icono por sección, repetido en todo lo que lleve a ella y no usado para otra cosa. */
export const ICONO_SECCION = {
  resumen: ChartBar,
  taquillaBoletos: Ticket,
  taquillaEncomiendas: Package,
  pagos: Receipt,
  reembolsos: ArrowCounterClockwise,
  despacho: TruckTrailer,
  recepcion: DownloadSimple,
  entrega: Handshake,
  viajes: CalendarBlank,
  rutas: MapTrifold,
  empleados: Users,
  configuracion: Gear,
  impresora: Printer,
  unidad: Bus,
  escanear: QrCode,
} satisfies Record<string, Icon>;

const AMBOS: RolPanel[] = ["admin_cooperativa", "taquillero"];
const ADMIN: RolPanel[] = ["admin_cooperativa"];

/** Menú en el orden del mostrador. El taquillero ve el mismo orden con menos ítems. */
export const NAV_GRUPOS: NavGrupo[] = [
  {
    items: [{ title: "Resumen", href: "/cooperativas/dashboard", icon: ICONO_SECCION.resumen, roles: AMBOS }],
  },
  {
    titulo: "Ventas y cobros",
    items: [
      { title: "Taquilla de boletos", href: "/cooperativas/taquilla/boletos", icon: ICONO_SECCION.taquillaBoletos, roles: AMBOS },
      { title: "Taquilla de encomiendas", href: "/cooperativas/taquilla/encomiendas", icon: ICONO_SECCION.taquillaEncomiendas, roles: AMBOS },
      { title: "Pagos por verificar", href: "/cooperativas/pagos", icon: ICONO_SECCION.pagos, roles: AMBOS, contador: "pagos_por_verificar" },
      { title: "Reembolsos", href: "/cooperativas/reembolsos", icon: ICONO_SECCION.reembolsos, roles: AMBOS, contador: "reembolsos_por_devolver" },
    ],
  },
  {
    titulo: "Encomiendas en ruta",
    items: [
      { title: "Despacho", href: "/cooperativas/despacho", icon: ICONO_SECCION.despacho, roles: AMBOS },
      { title: "Recepción en destino", href: "/cooperativas/recepcion-destino", icon: ICONO_SECCION.recepcion, roles: AMBOS, contador: "encomiendas_en_camino" },
      { title: "Entrega", href: "/cooperativas/entrega", icon: ICONO_SECCION.entrega, roles: AMBOS, contador: "encomiendas_por_vencer", tonoContador: "aviso" },
    ],
  },
  {
    titulo: "Operación",
    items: [
      { title: "Viajes", href: "/cooperativas/viajes", icon: ICONO_SECCION.viajes, roles: AMBOS },
      { title: "Rutas", href: "/cooperativas/rutas", icon: ICONO_SECCION.rutas, roles: ADMIN },
    ],
  },
  {
    titulo: "Cooperativa",
    items: [
      { title: "Empleados", href: "/cooperativas/empleados", icon: ICONO_SECCION.empleados, roles: ADMIN },
      { title: "Configuración", href: "/cooperativas/configuracion", icon: ICONO_SECCION.configuracion, roles: ADMIN },
    ],
  },
];

/** Pie del menú, encima del usuario: es del equipo, no una sección de trabajo. */
export const NAV_PIE: NavItem[] = [
  { title: "Impresora y lector", href: "/cooperativas/hardware", icon: ICONO_SECCION.impresora, roles: AMBOS },
];

/** @deprecated Usar `NAV_GRUPOS` / `navParaRol` (se borra en la integración de la fase 5). */
export const NAV_ITEMS: NavItem[] = [...NAV_GRUPOS.flatMap((g) => g.items), ...NAV_PIE];

/** Grupos del menú visibles para el rol; un grupo sin ítems no se devuelve. */
export function navParaRol(rol: RolPanel): NavGrupo[] {
  return NAV_GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(rol)) })).filter(
    (g) => g.items.length > 0
  );
}

/** true si `pathname` está dentro de la sección `href` (la sección y sus subrutas). */
export function esRutaActiva(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Sección (y su grupo) a la que pertenece `pathname`, o null fuera del menú. */
export function seccionDe(pathname: string): { grupo?: string; item: NavItem } | null {
  for (const g of NAV_GRUPOS) {
    const item = g.items.find((i) => esRutaActiva(pathname, i.href));
    if (item) return { grupo: g.titulo, item };
  }
  const pie = NAV_PIE.find((i) => esRutaActiva(pathname, i.href));
  return pie ? { item: pie } : null;
}
