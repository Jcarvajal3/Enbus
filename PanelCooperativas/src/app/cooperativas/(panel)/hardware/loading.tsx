import { Skeleton } from "@/components/ui/skeleton";

// Misma forma y ancho que "Impresora y lector" (max-w-4xl sin centrar, D17).
export default function ImpresoraLoading() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6" role="status" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 w-full rounded-md" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-60 w-full rounded-md" />
          <Skeleton className="h-44 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
