"use client";

import { useUser } from "@/hooks/use-user";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-navigation";
import { etiquetaRol } from "@/lib/estados";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignOut, Sun, Moon, Monitor } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useState, useEffect, useMemo } from "react";
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

export function AdminSidebar() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function fetchCount() {
      const { count, error } = await supabase
        .from("cooperativas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "PENDIENTE");
      
      if (!error && count !== null) {
        setPendingCount(count);
      }
    }

    fetchCount();

    // Realtime subscription to database changes for cooperativas status
    const channel = supabase
      .channel("cooperativas_pending_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cooperativas",
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        {/* Marca (AD-02): bloque "EB" sobre el color primario, sin el icono de escudo. */}
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-tight text-primary-foreground"
          >
            EB
          </div>
          <span className="font-bold tracking-tight">EnBus · Administración</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_NAV_ITEMS.map((item) => {
                const isSolicitudes = item.href === "/admin/solicitudes";
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      render={<Link href={item.href} prefetch={true} />}
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {isSolicitudes && pendingCount > 0 && (
                        // Contador estático (sin parpadeo), "99+" como máximo.
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                          <span aria-hidden>{pendingCount > 99 ? "99+" : pendingCount}</span>
                          <span className="sr-only">
                            {pendingCount === 1 ? "1 solicitud por revisar" : `${pendingCount} solicitudes por revisar`}
                          </span>
                        </span>
                      )}
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
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-semibold">
                      {user.nombre_completo?.charAt(0).toUpperCase() || "A"}
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
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {user.nombre_completo?.charAt(0).toUpperCase() || "A"}
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
                {mounted && theme === "light" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden>✓</span><span className="sr-only">(seleccionado)</span></span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                <Moon className="size-4 mr-2" aria-hidden />
                <span>Oscuro</span>
                {mounted && theme === "dark" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden>✓</span><span className="sr-only">(seleccionado)</span></span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
                <Monitor className="size-4 mr-2" aria-hidden />
                <span>Sistema</span>
                {mounted && theme === "system" && <span className="ml-auto text-xs text-primary-text"><span aria-hidden>✓</span><span className="sr-only">(seleccionado)</span></span>}
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
