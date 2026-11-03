import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

export default function PanelNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <MagnifyingGlass size={48} className="text-muted-foreground" weight="duotone" aria-hidden />
      </div>
      <h2 className="text-2xl font-bold">No encontramos esta página</h2>
      <p className="max-w-md text-muted-foreground">
        Puede que la dirección esté mal escrita o que la sección ya no exista. Usa el menú de la izquierda o vuelve al
        resumen.
      </p>
      <div className="mt-4">
        <Link href="/cooperativas/dashboard" className={buttonVariants({ variant: "default" })}>
          Volver al resumen
        </Link>
      </div>
    </div>
  );
}
