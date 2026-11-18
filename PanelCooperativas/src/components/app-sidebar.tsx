"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { CaretDown, SignOut, Sun, Moon, Monitor, type Icon } from "@phosphor-icons/react";
import { avisarError } from "@/lib/avisos";
import { useUser } from "@/hooks/use-user";
import { esRutaActiva, navParaRol, type ClaveContador, type RolPanel } from "@/lib/navigation";
import { contadoresCooperativa } from "@/lib/data/contadores-menu";
import { etiquetaRol } from "@/lib/estados";
import { humanizeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { olvidarPushDeEsteEquipo } from "@/components/push/push-navegador";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Piezas comunes de los dos menús (cooperativas y admin) ─────────────────

const REFRESCO_CONTADORES_MS = 60_000;

/** Pide los contadores al montar, al cambiar de ruta, al volver a la pestaña y cada 60 s. */
export function useContadoresMenu<T>(cargar: () => Promise<T>, inicial: T): T {
  const pathname = usePathname();
  const [valor, setValor] = useState<T>(inicial);

  useEffect(() => {
    let activo = true;
    const refrescar = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const nuevo = await cargar();
        if (activo) setValor(nuevo);
      } catch {
        // Sin red o sesión vencida: se conservan los últimos contadores conocidos;
        // la pantalla abierta ya avisa del problema con su propio estado de error.
      }
    };
    void refrescar();
    const id = window.setInterval(refrescar, REFRESCO_CONTADORES_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      activo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar, pathname]);

  return valor;
}

/** Contador de un ítem del menú; 0 no se dibuja. Activo = `accent-strong`, aviso = ámbar. */
export function ContadorMenu({
  n,
  activo,
  tono = "neutro",
  descripcion,
  className,
}: {
  n: number | undefined;
  activo: boolean;
  tono?: "neutro" | "aviso";
  descripcion: string;
  className?: string;
}) {
  if (!n) return null;
  return (
    <SidebarMenuBadge
      aria-hidden
      title={descripcion}
      className={cn(
        "top-1/2! -translate-y-1/2 rounded-full px-1.5 font-semibold",
        className,
        activo
          ? "bg-accent-strong text-accent-strong-foreground peer-data-active/menu-button:text-accent-strong-foreground"
          : tono === "aviso"
            ? "bg-warning-light text-warning-deep peer-hover/menu-button:text-warning-deep"
            : "bg-background text-foreground ring-1 ring-border ring-inset peer-hover/menu-button:text-foreground"
      )}
    >
      {n > 99 ? "99+" : n}
    </SidebarMenuBadge>
  );
}

/** Punto sobre el icono cuando el menú está plegado (el número no cabe). */
export function PuntoContador({ n, tono = "neutro" }: { n: number | undefined; tono?: "neutro" | "aviso" }) {
  if (!n) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full ring-2 ring-sidebar group-data-[collapsible=icon]:block",
        tono === "aviso" ? "bg-warning" : "bg-accent-strong"
      )}
    />
  );
}

/** Menú del usuario (pie): tema con radio y "Cerrar sesión" que avisa si falla. */
export function MenuUsuario({
  nombre,
  rol,
  login,
  variante = "menu",
}: {
  nombre: string;
  rol: string;
  login: string;
  /** "menu": botón del pie del menú lateral. "avatar": botón redondo de la cabecera móvil. */
  variante?: "menu" | "avatar";
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { state, isMobile } = useSidebar();
  const inicial = nombre?.trim().charAt(0).toUpperCase() || "U";

  const cerrarSesion = async () => {
    // Sin red, signOut falla y la sesión sigue abierta: decirlo en vez de ir al login.
    // scope "local": cierra solo este equipo. El global también tumbaba la sesión de la
    // misma cuenta en las otras taquillas (a mitad de una venta) y en la app móvil.
    // Antes de salir, este equipo deja de recibir avisos push de la cooperativa
    // (no lanza y tarda como mucho 3 s).
    await olvidarPushDeEsteEquipo();
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) {
      avisarError(humanizeError(error, "cerrar la sesión"));
      return;
    }
    router.replace(login);
    router.refresh();
  };

  const avatar = (
    <Avatar className="size-8 rounded-full">
      <AvatarFallback className="rounded-full bg-night-raised font-semibold text-sidebar-foreground">{inicial}</AvatarFallback>
    </Avatar>
  );

  const disparador =
    variante === "avatar" ? (
      <button
        type="button"
        aria-label={`Cuenta: ${nombre}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {avatar}
      </button>
    ) : (
      <SidebarMenuButton size="lg" aria-label={`Cuenta: ${nombre}`} className="data-popup-open:bg-night-raised">
        {avatar}
        <span className="grid min-w-0 flex-1 text-left text-[15px] leading-tight">
          <span className="truncate font-semibold">{nombre}</span>
          <span className="truncate text-[13px] font-normal text-night-muted">{rol}</span>
        </span>
      </SidebarMenuButton>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={disparador} />
      <DropdownMenuContent
        className="min-w-56"
        side={variante === "avatar" ? "bottom" : isMobile ? "top" : state === "collapsed" ? "right" : "top"}
        align={variante === "avatar" ? "end" : state === "collapsed" && !isMobile ? "end" : "start"}
        sideOffset={6}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 text-sm text-foreground">
            {avatar}
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-semibold">{nombre}</span>
              <span className="truncate text-xs text-muted-foreground">{rol}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden />
              Claro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden />
              Oscuro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden />
              Sistema
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={cerrarSesion}>
          <SignOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Bloques del menú: enlace directo y grupos plegables (Amanecer, §2) ─────

/** Lo mínimo que el menú necesita de un ítem (lo comparten el panel y el admin). */
export type ItemBase = { title: string; href: string; icon: Icon; tonoContador?: "neutro" | "aviso" };
export type GrupoBase = { id: string; titulo: string; icon: Icon; directo?: boolean; items: ItemBase[] };
/** Contador del ítem y su descripción hablada (vacía si no hay nada que contar). */
export type ConteoItem = { n: number | undefined; descripcion: string };

function ItemMenu({ item, pathname, conteo }: { item: ItemBase; pathname: string; conteo: ConteoItem }) {
  const activo = esRutaActiva(pathname, item.href);
  const { n, descripcion } = conteo;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} aria-current={activo ? "page" : undefined} />}
        isActive={activo}
        tooltip={descripcion ? `${item.title} · ${descripcion}` : item.title}
        className="relative"
      >
        <item.icon aria-hidden />
        <PuntoContador n={n} tono={item.tonoContador} />
        <span>
          {item.title}
          {descripcion && <span className="sr-only">{` (${descripcion})`}</span>}
        </span>
      </SidebarMenuButton>
      <ContadorMenu n={n} activo={activo} tono={item.tonoContador} descripcion={descripcion} />
    </SidebarMenuItem>
  );
}

const EVENTO_GRUPOS = "enbus-menu-grupos";

function suscribirGrupos(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_GRUPOS, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_GRUPOS, avisar);
  };
}

function leerGrupos(clave: string): string {
  try {
    return window.localStorage.getItem(clave) ?? "";
  } catch {
    return "";
  }
}

/**
 * Qué grupos están abiertos. El de la ruta activa, siempre al llegar; los demás, según lo
 * que la persona abrió (se recuerda en este equipo con localStorage). Si cierra el grupo
 * activo a mano, sigue cerrado mientras no cambie de grupo.
 */
function useGruposAbiertos(claveStorage: string, activoId: string | null) {
  const crudo = useSyncExternalStore(
    suscribirGrupos,
    () => leerGrupos(claveStorage),
    () => ""
  );
  const guardado = useMemo<Record<string, boolean>>(() => {
    try {
      const valor = JSON.parse(crudo || "null");
      return valor && typeof valor === "object" ? valor : {};
    } catch {
      return {};
    }
  }, [crudo]);

  // Elecciones de esta visita (valen aunque el almacenamiento esté bloqueado).
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({});
  const [activoPrevio, setActivoPrevio] = useState(activoId);
  if (activoPrevio !== activoId) {
    // Ajuste durante el render: al llegar a otro grupo se olvida lo que se cerró a mano.
    setActivoPrevio(activoId);
    if (activoId && activoId in elegidos) {
      const resto = { ...elegidos };
      delete resto[activoId];
      setElegidos(resto);
    }
  }

  const estaAbierto = (id: string) => elegidos[id] ?? (id === activoId ? true : (guardado[id] ?? false));

  const alternar = (id: string, abierto: boolean) => {
    setElegidos((previo) => ({ ...previo, [id]: abierto }));
    try {
      window.localStorage.setItem(claveStorage, JSON.stringify({ ...guardado, [id]: abierto }));
      window.dispatchEvent(new Event(EVENTO_GRUPOS));
    } catch {
      // Modo privado o almacenamiento bloqueado: el menú sigue funcionando sin recordar.
    }
  };

  return { estaAbierto, alternar };
}

function GrupoMenu({
  grupo,
  pathname,
  abierto,
  plegadoAIconos,
  onAlternar,
  conteo,
}: {
  grupo: GrupoBase;
  pathname: string;
  abierto: boolean;
  plegadoAIconos: boolean;
  onAlternar: (abierto: boolean) => void;
  conteo: (item: ItemBase) => ConteoItem;
}) {
  const idLista = `menu-grupo-${grupo.id}`;
  const contieneActiva = grupo.items.some((i) => esRutaActiva(pathname, i.href));
  const conteos = grupo.items.map((item) => ({ item, ...conteo(item) }));
  const total = conteos.reduce((suma, c) => suma + (c.n ?? 0), 0);
  const hayAviso = conteos.some((c) => c.n && c.item.tonoContador === "aviso");
  const descripcionTotal = conteos
    .filter((c) => c.n)
    .map((c) => c.descripcion)
    .join(", ");
  const nombre = descripcionTotal ? `${grupo.titulo} (${descripcionTotal})` : grupo.titulo;

  // Menú plegado a iconos: el grupo es un icono que abre un menú con sus ítems, así se
  // llega a cualquier sección en un solo gesto (navegar al primero escondería el resto).
  if (plegadoAIconos) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                isActive={contieneActiva}
                tooltip={nombre}
                aria-label={nombre}
                className="relative data-popup-open:bg-night-raised data-popup-open:data-active:bg-sidebar-accent"
              >
                <grupo.icon aria-hidden />
                <PuntoContador n={total} tono={hayAviso ? "aviso" : "neutro"} />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="min-w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[13px]">{grupo.titulo}</DropdownMenuLabel>
              {conteos.map(({ item, n, descripcion }) => {
                const activo = esRutaActiva(pathname, item.href);
                return (
                  <DropdownMenuItem
                    key={item.href}
                    render={<Link href={item.href} aria-current={activo ? "page" : undefined} />}
                    className={cn("min-h-11 text-[15px]", activo && "bg-muted font-semibold")}
                  >
                    <item.icon aria-hidden className="size-5" />
                    <span className="flex-1">
                      {item.title}
                      {descripcion && <span className="sr-only">{` (${descripcion})`}</span>}
                    </span>
                    {n ? (
                      <span
                        aria-hidden
                        className={cn(
                          "rounded-full px-1.5 text-xs font-semibold tabular-nums",
                          item.tonoContador === "aviso" ? "bg-warning-light text-warning-deep" : "bg-muted text-foreground"
                        )}
                      >
                        {n > 99 ? "99+" : n}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  // Con el grupo abierto la pastilla blanca la lleva el ítem activo; plegado, la lleva el grupo.
  const activoComoGrupo = contieneActiva && !abierto;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={activoComoGrupo}
        aria-expanded={abierto}
        aria-controls={idLista}
        onClick={() => onAlternar(!abierto)}
        className={cn("relative", contieneActiva && abierto && "font-semibold")}
      >
        <grupo.icon aria-hidden />
        <span className="flex-1">
          {grupo.titulo}
          {!abierto && descripcionTotal && <span className="sr-only">{` (${descripcionTotal})`}</span>}
        </span>
        <CaretDown aria-hidden className={cn("size-4! shrink-0 transition-transform", abierto && "rotate-180")} />
      </SidebarMenuButton>
      {!abierto && (
        <ContadorMenu
          n={total}
          activo={activoComoGrupo}
          tono={hayAviso ? "aviso" : "neutro"}
          descripcion={descripcionTotal}
          className="right-10"
        />
      )}
      <SidebarMenu id={idLista} hidden={!abierto} className="mt-1 gap-1 pl-3">
        {conteos.map(({ item, ...c }) => (
          <ItemMenu key={item.href} item={item} pathname={pathname} conteo={c} />
        ))}
      </SidebarMenu>
    </SidebarMenuItem>
  );
}

/** Lista de bloques del menú: enlaces directos y grupos plegables. */
export function GruposMenu({
  grupos,
  claveStorage,
  conteo,
}: {
  grupos: GrupoBase[];
  /** Dónde se recuerdan los grupos abiertos (uno por menú). */
  claveStorage: string;
  conteo: (item: ItemBase) => ConteoItem;
}) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const plegadoAIconos = state === "collapsed" && !isMobile;
  const activoId = grupos.find((g) => !g.directo && g.items.some((i) => esRutaActiva(pathname, i.href)))?.id ?? null;
  const { estaAbierto, alternar } = useGruposAbiertos(claveStorage, activoId);

  return (
    <SidebarGroup className="py-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {grupos.map((grupo) =>
            grupo.directo ? (
              <ItemMenu key={grupo.id} item={grupo.items[0]} pathname={pathname} conteo={conteo(grupo.items[0])} />
            ) : (
              <GrupoMenu
                key={grupo.id}
                grupo={grupo}
                pathname={pathname}
                abierto={estaAbierto(grupo.id)}
                plegadoAIconos={plegadoAIconos}
                onAlternar={(abierto) => alternar(grupo.id, abierto)}
                conteo={conteo}
              />
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Cabecera de los dos menús: marca y, debajo, el contexto (cooperativa / zona). */
export function CabeceraMenu({ contexto, children }: { contexto: string; children?: React.ReactNode }) {
  return (
    <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:px-2">
      <div className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center">
        <BrandMark tamano="md" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">EnBus</span>
          <span className="truncate text-[13px] text-night-muted" title={contexto}>
            {contexto}
          </span>
        </div>
      </div>
      {children}
    </SidebarHeader>
  );
}

// ─── Menú del panel de cooperativas ─────────────────────────────────────────

const DESCRIPCION_CONTADOR: Record<ClaveContador, (n: number) => string> = {
  pagos_por_verificar: (n) => (n === 1 ? "1 pago por verificar" : `${n} pagos por verificar`),
  reembolsos_por_devolver: (n) => (n === 1 ? "1 reembolso por devolver" : `${n} reembolsos por devolver`),
  encomiendas_en_camino: (n) => (n === 1 ? "1 encomienda en camino" : `${n} encomiendas en camino`),
  encomiendas_por_vencer: (n) => (n === 1 ? "1 encomienda por vencer" : `${n} encomiendas por vencer`),
};

const CLAVE_GRUPOS_PANEL = "enbus.menu.grupos.panel";

/** Grupos del menú del rol y contadores de cada ítem (los usan el menú lateral y la barra de pestañas móvil). */
export function useMenuPanel(): { grupos: ReturnType<typeof navParaRol>; conteo: (item: ItemBase) => ConteoItem } {
  const { user } = useUser();
  const contadores = useContadoresMenu(contadoresCooperativa, {});
  const grupos = navParaRol(user.role as RolPanel);

  // `ItemBase` no lleva la clave del contador: se busca el ítem original por su href.
  const conteo = (item: ItemBase): ConteoItem => {
    const clave = grupos.flatMap((g) => g.items).find((i) => i.href === item.href)?.contador;
    const n = clave ? contadores[clave] : undefined;
    return { n, descripcion: clave && n ? DESCRIPCION_CONTADOR[clave](n) : "" };
  };
  return { grupos, conteo };
}

export function AppSidebar() {
  const { user } = useUser();
  const { grupos, conteo } = useMenuPanel();

  const rol = user.role as RolPanel;
  const cooperativa = user.cooperativa_nombre || "Cooperativa";
  const sucursal = user.sucursal_nombre;
  const contexto = sucursal ? `${cooperativa} · ${sucursal}` : cooperativa;

  return (
    <Sidebar collapsible="icon">
      <CabeceraMenu contexto={contexto}>
        {!sucursal && rol === "taquillero" && (
          <span
            className="inline-flex w-fit items-center rounded-full bg-warning-light px-2.5 py-0.5 text-[13px] font-semibold text-warning-deep group-data-[collapsible=icon]:hidden"
            title="Pídele al administrador de tu cooperativa que te asigne una sucursal."
          >
            Sin sucursal
          </span>
        )}
      </CabeceraMenu>

      <SidebarContent className="px-2">
        <GruposMenu grupos={grupos} claveStorage={CLAVE_GRUPOS_PANEL} conteo={conteo} />
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <MenuUsuario nombre={user.nombre_completo} rol={etiquetaRol(user.role)} login="/cooperativas/login" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
