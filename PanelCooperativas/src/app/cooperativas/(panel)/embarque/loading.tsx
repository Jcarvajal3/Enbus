import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que la página: encabezado + bus + escáner + pasajeros.
export default function EmbarqueLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-44 w-full rounded-md" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full max-w-md rounded-full" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </div>
  );
}
