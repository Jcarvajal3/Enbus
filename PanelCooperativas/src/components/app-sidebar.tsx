"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { SignOut, Sun, Moon, Monitor } from "@phosphor-icons/react";
import { avisarError } from "@/lib/avisos";
import { useUser } from "@/hooks/use-user";
import { esRutaActiva, navParaRol, NAV_PIE, type ClaveContador, type NavItem, type RolPanel } from "@/lib/navigation";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
}: {
  n: number | undefined;
  activo: boolean;
  tono?: "neutro" | "aviso";
  descripcion: string;
}) {
  if (!n) return null;
  return (
    <SidebarMenuBadge
      aria-hidden
      title={descripcion}
      className={cn(
        "top-1/2! -translate-y-1/2 rounded-full px-1.5 font-semibold",
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
export function MenuUsuario({ nombre, rol, login }: { nombre: string; rol: string; login: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { state, isMobile } = useSidebar();
  const inicial = nombre?.trim().charAt(0).toUpperCase() || "U";

  const cerrarSesion = async () => {
    // Sin red, signOut falla y la sesión sigue abierta: decirlo en vez de ir al login.
    // scope "local": cierra solo este equipo. El global también tumbaba la sesión de la
    // misma cuenta en las otras taquillas (a mitad de una venta) y en la app móvil.
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
      <AvatarFallback className="rounded-full bg-muted font-semibold text-foreground">{inicial}</AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg" aria-label={`Cuenta: ${nombre}`} className="data-popup-open:bg-sidebar-accent">
            {avatar}
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{nombre}</span>
              <span className="truncate text-xs text-muted-foreground">{rol}</span>
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent
        className="min-w-56"
        side={isMobile ? "top" : state === "collapsed" ? "right" : "top"}
        align={state === "collapsed" && !isMobile ? "end" : "start"}
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

// ─── Menú del panel de cooperativas ─────────────────────────────────────────

const DESCRIPCION_CONTADOR: Record<ClaveContador, (n: number) => string> = {
  pagos_por_verificar: (n) => (n === 1 ? "1 pago por verificar" : `${n} pagos por verificar`),
  reembolsos_por_devolver: (n) => (n === 1 ? "1 reembolso por devolver" : `${n} reembolsos por devolver`),
  encomiendas_en_camino: (n) => (n === 1 ? "1 encomienda en camino" : `${n} encomiendas en camino`),
  encomiendas_por_vencer: (n) => (n === 1 ? "1 encomienda por vencer" : `${n} encomiendas por vencer`),
};

function ItemMenu({
  item,
  pathname,
  contadores,
}: {
  item: NavItem;
  pathname: string;
  contadores: Partial<Record<ClaveContador, number>>;
}) {
  const activo = esRutaActiva(pathname, item.href);
  const n = item.contador ? contadores[item.contador] : undefined;
  const descripcion = item.contador && n ? DESCRIPCION_CONTADOR[item.contador](n) : "";
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

export function AppSidebar() {
  const { user } = useUser();
  const pathname = usePathname();
  const contadores = useContadoresMenu(contadoresCooperativa, {});

  const rol = user.role as RolPanel;
  const grupos = navParaRol(rol);
  const pie = NAV_PIE.filter((i) => i.roles.includes(rol));
  const cooperativa = user.cooperativa_nombre || "Cooperativa";
  const sucursal = user.sucursal_nombre;
  const contexto = sucursal ? `${cooperativa} · ${sucursal}` : cooperativa;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark tamano="sm" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">EnBus</span>
            <span className="truncate text-xs text-muted-foreground" title={contexto}>
              {contexto}
            </span>
          </div>
        </div>
        {!sucursal && rol === "taquillero" && (
          <span
            className="inline-flex w-fit items-center rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning-deep group-data-[collapsible=icon]:hidden"
            title="Pídele al administrador de tu cooperativa que te asigne una sucursal."
          >
            Sin sucursal
          </span>
        )}
      </SidebarHeader>

      <SidebarContent>
        {grupos.map((grupo, i) => (
          <SidebarGroup key={grupo.titulo ?? `grupo-${i}`} className="py-1">
            {grupo.titulo && <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.items.map((item) => (
                  <ItemMenu key={item.href} item={item} pathname={pathname} contadores={contadores} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <SidebarMenu>
          {pie.map((item) => (
            <ItemMenu key={item.href} item={item} pathname={pathname} contadores={contadores} />
          ))}
          <SidebarMenuItem>
            <MenuUsuario nombre={user.nombre_completo} rol={etiquetaRol(user.role)} login="/cooperativas/login" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
