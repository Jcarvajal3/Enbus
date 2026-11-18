import { Skeleton } from "@/components/ui/skeleton";

// Misma forma y ancho que "Impresora y lector" (max-w-4xl sin centrar, D17).
export default function ImpresoraLoading() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8" role="status" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-64 max-md:hidden" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 w-full rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-60 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
