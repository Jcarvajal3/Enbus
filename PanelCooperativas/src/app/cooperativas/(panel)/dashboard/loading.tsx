import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que el Resumen: título, "Requiere tu atención", "Hoy" (4 KPI) y
// las encomiendas recientes.
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <Skeleton className="h-8 w-40" aria-hidden />

      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex-row items-start gap-4 px-5 py-5">
              <Skeleton className="size-11 rounded-2xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-6 w-16" />
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-3 px-4 py-4 md:px-5 md:py-5">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="size-5 rounded-full" />
              </div>
              <Skeleton className="h-8 w-20" />
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-6 w-52" />
        <TablaSkeleton columnas={6} filas={5} />
      </div>
    </div>
  );
}
