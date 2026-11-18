import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { IconTile } from "@/components/icon-tile";
import { buttonVariants } from "@/components/ui/button";
import { INICIO_ADMIN } from "@/lib/admin-navigation";
import { cn } from "@/lib/utils";

// 404 dentro del admin: sin referencias al menú, que en teléfono está oculto.
export default function AdminPanelNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center md:p-12">
      <IconTile icon={MagnifyingGlass} tone="neutral" size="xl" />
      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">No encontramos esta página.</h1>
      <Link href={INICIO_ADMIN} className={cn(buttonVariants({ variant: "default", size: "lg" }), "max-md:w-full")}>
        Ir al Resumen
      </Link>
    </div>
  );
}
