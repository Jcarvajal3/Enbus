import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Misma forma y ancho que Configuración (max-w-4xl, sin centrar): título,
// pestañas y la lista de la primera pestaña.
export default function ConfiguracionLoading() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <Skeleton className="h-8 w-48" aria-hidden />
      <Skeleton className="h-9 w-80 max-w-full rounded-full" aria-hidden />
      <TablaSkeleton columnas={4} filas={4} />
    </div>
  );
}
