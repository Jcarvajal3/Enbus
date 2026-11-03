import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { buttonVariants } from "@/components/ui/button";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

// 404 dentro del admin: sin referencias al menú, que en teléfono está oculto.
export default function AdminPanelNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <MagnifyingGlass className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-base font-semibold text-foreground">No encontramos esta página.</h1>
      <Link href={INICIO_ADMIN} className={buttonVariants({ variant: "default" })}>
        Ir al Resumen
      </Link>
    </div>
  );
}
