import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

export default function PanelNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 h-full">
      <div className="bg-muted p-4 rounded-full">
        <MagnifyingGlass size={48} className="text-muted-foreground" weight="duotone" />
      </div>
      <h2 className="text-2xl font-bold">Página no encontrada</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Lo sentimos, no pudimos encontrar la página que estás buscando. Es posible que haya sido eliminada o que la dirección sea incorrecta.
      </p>
      <div className="mt-4">
        <Link href="/cooperativas/dashboard" className={buttonVariants({ variant: "default" })}>
          Volver al Inicio
        </Link>
      </div>
    </div>
  );
}
