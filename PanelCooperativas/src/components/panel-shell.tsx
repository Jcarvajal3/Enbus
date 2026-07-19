"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { UserProvider, type UserProfile } from "@/hooks/use-user";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";

export function PanelShell({ user, children }: { user: UserProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const currentItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const pageTitle = currentItem ? currentItem.title : "Panel";

  return (
    <UserProvider initialUser={user}>
      <ServiceWorkerRegistrar />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Connectivity banner — always pinned at the very top, above header */}
          <ConnectivityBanner />
          {/* Pending approval banner — shown when cooperativa is in PENDIENTE state */}
          <PendingApprovalBanner />
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </UserProvider>
  );
}
