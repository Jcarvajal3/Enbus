import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado + pestañas + tabla (PU-13).
export default function BoletosLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full max-w-xl rounded-full" />
        <TablaSkeleton columnas={7} />
      </div>
    </div>
  );
}
