import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

export default function AdminPanelNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 h-full text-white">
      <div className="bg-slate-800 p-4 rounded-full">
        <MagnifyingGlass size={48} className="text-slate-400" weight="duotone" />
      </div>
      <h2 className="text-2xl font-bold">Página no encontrada</h2>
      <p className="text-slate-400 text-center max-w-md">
        Lo sentimos, no pudimos encontrar la página que estás buscando. Es posible que haya sido eliminada o que la dirección sea incorrecta.
      </p>
      <div className="mt-4">
        <Link href="/admin/dashboard" className={buttonVariants({ variant: "default" }) + " bg-orange-600 hover:bg-orange-700 text-white"}>
          Volver al Inicio
        </Link>
      </div>
    </div>
  );
}
