"use client";

import { AdminSidebar } from "@/components/admin-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserProvider, type UserProfile } from "@/hooks/use-user";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-navigation";

export function AdminShell({ user, children }: { user: UserProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const currentItem = ADMIN_NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const seccion = currentItem ? currentItem.title : "Administración";

  return (
    <UserProvider initialUser={user}>
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset>
          {/* La ruta completa ("Cooperativas › Expresos del Táchira") la dibuja PageHeader con `migas`;
              aquí solo queda el nombre de la sección, sin un segundo landmark de navegación. */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <p className="text-sm font-medium text-foreground">{seccion}</p>
          </header>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </UserProvider>
  );
}
