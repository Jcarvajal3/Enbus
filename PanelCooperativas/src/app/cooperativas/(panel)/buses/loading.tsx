import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado con botón + tabla (PU-13).
export default function BusesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <TablaSkeleton columnas={5} />
    </div>
  );
}
