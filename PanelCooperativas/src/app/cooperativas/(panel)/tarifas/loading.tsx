import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado + grilla de 2 columnas (5/7) con tarjetas a la izquierda
// e historial de tarifas a la derecha.
export default function TarifasLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between" aria-hidden>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-36 md:h-10" />
          <Skeleton className="h-4 w-72 max-md:hidden" />
        </div>
        <Skeleton className="h-12 w-full rounded-full md:w-40" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-hidden>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-36" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-20 rounded-md" />
                <Skeleton className="h-20 rounded-md" />
                <Skeleton className="h-20 rounded-md" />
                <Skeleton className="h-20 rounded-md" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <TablaSkeleton columnas={5} filas={6} />
        </div>
      </div>
    </div>
  );
}
