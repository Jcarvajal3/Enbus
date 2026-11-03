import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado + escáner + pestañas + tabla (PU-13).
export default function TaquillaLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-44 rounded-full" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]" aria-hidden>
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full max-w-2xl rounded-full" />
        <TablaSkeleton columnas={8} />
      </div>
    </div>
  );
}
