import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que el asistente: flecha + progreso, título del paso y filtros + salidas.
export default function VenderBoletosLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" role="status" aria-label="Cargando la venta">
      <div className="flex items-center gap-4" aria-hidden>
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-1.5 flex-1 rounded-full" />
      </div>
      <Skeleton className="h-9 w-64" aria-hidden />
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-12 w-full rounded-md" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
