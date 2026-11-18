import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma que la página: encabezado con acción principal (ancho completo en móvil) +
// lista (tarjetas en móvil, tabla desde md) (PU-13).
export default function RutasLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between" aria-hidden>
        <Skeleton className="h-8 w-40 md:h-10" />
        <Skeleton className="h-12 w-full rounded-full md:w-40" />
      </div>
      <TablaSkeleton columnas={5} />
    </div>
  );
}
