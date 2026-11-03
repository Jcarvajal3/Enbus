import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que la página: encabezado + dos columnas (viajes y escaneo).
export default function DespachoLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-80 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-36 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
