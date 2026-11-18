import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Carga de una lista (§2.3, PU-13) ───────────────────────────────────────
// La misma forma en `loading.tsx` y en el primer render del cliente: barra de
// filtros (opcional) + tabla dentro de `Card p-0`. Sin spinner ni "Cargando…".

// Anchos fijos (sin aleatoriedad: igual en servidor y cliente).
const ANCHOS = ["w-24", "w-36", "w-28", "w-20", "w-32", "w-16", "w-24", "w-28"];

export function TablaSkeleton({
  columnas,
  filas = 6,
  conFiltros = false,
}: {
  columnas: number;
  filas?: number;
  conFiltros?: boolean;
}) {
  const cols = Array.from({ length: Math.max(1, columnas) }, (_, i) => i);
  return (
    <div role="status" aria-label="Cargando" aria-busy="true" className="flex flex-col gap-4">
      {conFiltros && (
        <div className="flex flex-wrap items-end gap-3" aria-hidden>
          <div className="flex w-full flex-col gap-2 sm:w-72">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-44">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      )}
      {/* Móvil: lista de tarjetas con la forma de `EntityCard`. */}
      <div className="flex flex-col gap-3 md:hidden" aria-hidden>
        {Array.from({ length: Math.min(filas, 5) }, (_, f) => (
          <div key={f} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className={cn("h-4.5", f % 2 === 0 ? "w-3/5" : "w-2/5")} />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
              <Skeleton className="h-4 w-14 shrink-0" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          </div>
        ))}
      </div>
      <Card className="gap-0 p-0 max-md:hidden" aria-hidden>
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c} className={cn(c >= 3 && "hidden lg:table-cell")}>
                  <Skeleton className="h-3.5 w-16" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: filas }, (_, f) => (
              <TableRow key={f} className="hover:bg-transparent">
                {cols.map((c) => (
                  <TableCell key={c} className={cn("h-14", c >= 3 && "hidden lg:table-cell")}>
                    <Skeleton className={cn("h-4", ANCHOS[(c + f) % ANCHOS.length])} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
