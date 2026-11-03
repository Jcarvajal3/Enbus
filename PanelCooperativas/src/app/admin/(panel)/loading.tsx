import { Skeleton } from "@/components/ui/skeleton";
import { TablaSkeleton } from "@/components/tabla-skeleton";

// Carga de una sección: misma forma y ancho que la página que llega
// (PageHeader + filtros + tabla a ancho completo; PN-25, AD5-42). Sin animación de entrada.
export default function AdminPanelLoading() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-8 w-56" />
      </div>
      <TablaSkeleton columnas={6} conFiltros />
    </div>
  );
}
