import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado + pestañas + filtros + tabla (PU-13).
export default function ViajesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-12 w-44 rounded-full" />
      </div>
      <Skeleton className="h-11 w-80 max-w-full rounded-full" />
      <TablaSkeleton columnas={7} conFiltros />
    </div>
  );
}
