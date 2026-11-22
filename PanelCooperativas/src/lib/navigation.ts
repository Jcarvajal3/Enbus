import {
  ChartBar, Package, Ticket, TruckTrailer,
  MapTrifold, Users, Gear, CalendarBlank,
  DownloadSimple, Handshake, Receipt, ArrowCounterClockwise, Printer,
  Bus, QrCode, UserCheck, Buildings, CurrencyDollar,
} from "@phosphor-icons/react/dist/ssr";
// Iconos de la entrada SSR: este módulo lo importan el proxy y los Server Components,
// donde la entrada normal (con React context) no se puede evaluar.
import type { Icon } from "@phosphor-icons/react";

// ─── Mapa del panel de cooperativas (Amanecer, §2) ───────────────────────────
// Una sola fuente para el menú, la miga de la barra superior, la pestaña del
// navegador y los iconos de cada sección. El nombre de una sección es el mismo
// en el menú, la miga, el H1 y el <title> ("<Sección> · EnBus"), con una excepción
// declarada con `tituloPagina`.

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
  /** Texto del menú y de la miga; también el H1 y la pestaña salvo que haya `tituloPagina`. */
  title: string;
  /** Solo si el H1 y la pestaña del navegador deben decir otra cosa que el menú. */
  tituloPagina?: string;
  href: string;
  icon: Icon;
  roles: RolPanel[];
  contador?: ClaveContador;
  tonoContador?: "neutro" | "aviso";
};

/**
 * Bloque del menú. `directo`: enlace suelto (un solo ítem, sin plegar y sin grupo en la miga).
 * Si no, grupo plegable con su icono; la miga muestra "Grupo › Sección".
 */
export type NavGrupo = { id: string; titulo: string; icon: Icon; directo?: boolean; items: NavItem[] };

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
  cooperativa: Buildings,
  impresora: Printer,
  unidad: Bus,
  escanear: QrCode,
  embarque: UserCheck,
  buses: Bus,
  tarifas: CurrencyDollar,
} satisfies Record<string, Icon>;

const AMBOS: RolPanel[] = ["admin_cooperativa", "taquillero"];
const ADMIN: RolPanel[] = ["admin_cooperativa"];

/**
 * Menú en cuatro bloques: Resumen y tres grupos plegables. El taquillero ve los mismos
 * bloques con menos ítems; un grupo sin ítems para el rol no se muestra.
 */
export const NAV_GRUPOS: NavGrupo[] = [
  {
    id: "resumen",
    titulo: "Resumen",
    icon: ChartBar,
    directo: true,
    items: [{ title: "Resumen", href: "/cooperativas/dashboard", icon: ICONO_SECCION.resumen, roles: AMBOS }],
  },
  {
    id: "boletos",
    titulo: "Boletos",
    icon: Ticket,
    items: [
      { title: "Taquilla de boletos", href: "/cooperativas/taquilla/boletos", icon: ICONO_SECCION.taquillaBoletos, roles: AMBOS },
      { title: "Pagos por verificar", href: "/cooperativas/pagos", icon: ICONO_SECCION.pagos, roles: AMBOS, contador: "pagos_por_verificar" },
      { title: "Reembolsos", href: "/cooperativas/reembolsos", icon: ICONO_SECCION.reembolsos, roles: AMBOS, contador: "reembolsos_por_devolver" },
      { title: "Embarque", href: "/cooperativas/embarque", icon: ICONO_SECCION.embarque, roles: AMBOS },
      { title: "Viajes", href: "/cooperativas/viajes", icon: ICONO_SECCION.viajes, roles: AMBOS },
    ],
  },
  {
    id: "encomiendas",
    titulo: "Encomiendas",
    icon: Package,
    items: [
      { title: "Taquilla de encomiendas", href: "/cooperativas/taquilla/encomiendas", icon: ICONO_SECCION.taquillaEncomiendas, roles: AMBOS },
      { title: "Despacho", href: "/cooperativas/despacho", icon: ICONO_SECCION.despacho, roles: AMBOS },
      { title: "Recepción en destino", href: "/cooperativas/recepcion-destino", icon: ICONO_SECCION.recepcion, roles: AMBOS, contador: "encomiendas_en_camino" },
      { title: "Entrega", href: "/cooperativas/entrega", icon: ICONO_SECCION.entrega, roles: AMBOS, contador: "encomiendas_por_vencer", tonoContador: "aviso" },
    ],
  },
  {
    id: "configuracion",
    titulo: "Configuración",
    icon: Gear,
    items: [
      { title: "Buses", href: "/cooperativas/buses", icon: ICONO_SECCION.buses, roles: ADMIN },
      { title: "Rutas", href: "/cooperativas/rutas", icon: ICONO_SECCION.rutas, roles: ADMIN },
      { title: "Tarifas", href: "/cooperativas/tarifas", icon: ICONO_SECCION.tarifas, roles: ADMIN },
      { title: "Empleados", href: "/cooperativas/empleados", icon: ICONO_SECCION.empleados, roles: ADMIN },
      // En el menú es "Cooperativa" (el grupo ya dice "Configuración"); la página sigue
      // titulándose "Configuración" en su H1 y en la pestaña del navegador.
      { title: "Cooperativa", tituloPagina: "Configuración", href: "/cooperativas/configuracion", icon: ICONO_SECCION.cooperativa, roles: ADMIN },
      { title: "Impresora y lector", href: "/cooperativas/hardware", icon: ICONO_SECCION.impresora, roles: AMBOS },
    ],
  },
];

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

/** Sección (y su grupo) a la que pertenece `pathname`, o null fuera del menú. Un enlace directo no tiene grupo. */
export function seccionDe(pathname: string): { grupo?: string; item: NavItem } | null {
  for (const g of NAV_GRUPOS) {
    const item = g.items.find((i) => esRutaActiva(pathname, i.href));
    if (item) return { grupo: g.directo ? undefined : g.titulo, item };
  }
  return null;
}

/** Nombre de la sección con ese `href` (para `metadata.title` de su layout: "<Sección> · EnBus"). */
export function tituloSeccion(href: string): string {
  const item = NAV_GRUPOS.flatMap((g) => g.items).find((i) => i.href === href);
  if (!item) throw new Error(`Sección desconocida: ${href}`);
  return item.tituloPagina ?? item.title;
}
