"use client";

import { useUser } from "@/hooks/use-user";
import { NAV_ITEMS, esRutaActiva, type RolPanel } from "@/lib/navigation";
import { etiquetaRol } from "@/lib/estados";
import { humanizeError } from "@/lib/errores";
import { toast } from "sonner";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Bus, SignOut, Sun, Moon, Monitor } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

export function AppSidebar() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSignOut = async () => {
    // Sin red, signOut falla y la sesión sigue abierta: decirlo en vez de ir al login.
    // scope "local": cierra solo este equipo. El global también tumbaba la sesión de la
    // misma cuenta en las otras taquillas (a mitad de una venta).
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      toast.error(humanizeError(error, "cerrar la sesión"));
      return;
    }
    router.replace("/cooperativas/login");
    router.refresh();
  };

  const filteredNavItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as RolPanel)
  );

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-5 text-primary-foreground" aria-hidden />
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight">EnBus</span>
            <span className="max-w-[150px] truncate text-xs text-muted-foreground">
              {user?.cooperativa_nombre || "Cooperativa"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                // Activo en la sección y en sus subrutas o pestañas (?tab=…).
                const activo = esRutaActiva(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} prefetch={true} aria-current={activo ? "page" : undefined} />
                      }
                      isActive={activo}
                      tooltip={item.title}
                    >
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {user.nombre_completo?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.nombre_completo}</span>
                    <span className="truncate text-xs text-muted-foreground">{etiquetaRol(user.role)}</span>
                  </div>
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
              <div className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {user.nombre_completo?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate font-semibold">{user.nombre_completo}</span>
                    <span className="truncate text-xs text-muted-foreground">{etiquetaRol(user.role)}</span>
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Tema</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
                <Sun className="size-4 mr-2" aria-hidden />
                <span>Claro</span>
                {mounted && theme === "light" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden="true">✓</span><span className="sr-only">(seleccionado)</span></span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                <Moon className="size-4 mr-2" aria-hidden />
                <span>Oscuro</span>
                {mounted && theme === "dark" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden="true">✓</span><span className="sr-only">(seleccionado)</span></span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
                <Monitor className="size-4 mr-2" aria-hidden />
                <span>Sistema</span>
                {mounted && theme === "system" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden="true">✓</span><span className="sr-only">(seleccionado)</span></span>}
              </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive-text focus:text-destructive-text">
                <SignOut aria-hidden />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
