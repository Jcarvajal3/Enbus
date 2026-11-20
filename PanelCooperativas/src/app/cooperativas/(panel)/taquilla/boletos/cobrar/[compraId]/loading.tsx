import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que el cobro: flecha, título, total y métodos de pago.
export default function CobrarReservaLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" role="status" aria-label="Cargando el cobro">
      <Skeleton className="size-12 rounded-full" aria-hidden />
      <Skeleton className="h-9 w-48" aria-hidden />
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-24 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
