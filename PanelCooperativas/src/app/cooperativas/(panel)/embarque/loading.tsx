import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que la página: encabezado + bus + escáner + pasajeros.
export default function EmbarqueLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full max-w-md rounded-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
