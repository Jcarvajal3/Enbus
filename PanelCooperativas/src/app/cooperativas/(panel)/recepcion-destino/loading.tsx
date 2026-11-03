import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado + escáner + tabla (PU-13).
export default function RecepcionDestinoLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-52 rounded-full" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]" aria-hidden>
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <TablaSkeleton columnas={5} />
    </div>
  );
}
