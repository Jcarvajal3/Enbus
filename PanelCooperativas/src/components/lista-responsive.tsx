"use client";

import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// ─── ListaResponsive: tabla en escritorio, tarjetas en móvil ────────────────
// Recibe los datos una vez y dos renderizadores. En ≥ md (768 px) dibuja lo que
// devuelva `tabla(items)`; por debajo, una lista de `tarjeta(item)` (normalmente
// `EntityCard`) con gap 12. Solo se monta una de las dos vistas, así que no hay
// ids ni controles duplicados. No toca datos: filtra y pagina antes (p. ej. con
// `usePaginacion`) y pásale `visibles`.
//
//   const { visibles, pagina, paginas, ir } = usePaginacion(filas);
//   <Card className="gap-0 overflow-hidden p-0 max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
//     <ListaResponsive
//       items={visibles}
//       clave={(r) => r.id}
//       etiqueta="Rutas"
//       tabla={(items) => (
//         <Table>
//           <TableHeader>…</TableHeader>
//           <TableBody>{items.map((r) => <TableRow key={r.id}>…</TableRow>)}</TableBody>
//         </Table>
//       )}
//       tarjeta={(r) => (
//         <EntityCard href={`/rutas/${r.id}`} title={`${r.origen} → ${r.destino}`} … />
//       )}
//       vacio={<EmptyState icon={Path} title="Sin rutas" …/>}
//     />
//     <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
//   </Card>
//
// Si la lista no va dentro de una `Card` (tarjetas sueltas sobre el canvas en
// móvil), el contenedor de la tabla sigue siendo cosa de quien llama.

export function ListaResponsive<T>({
  items,
  clave,
  tabla,
  tarjeta,
  vacio,
  etiqueta,
  className,
}: {
  items: T[];
  clave(item: T, indice: number): string | number;
  /** Escritorio (≥ md): la tabla completa, con cabecera y filas. */
  tabla(items: T[]): ReactNode;
  /** Móvil (< md): una tarjeta por elemento (`EntityCard`). */
  tarjeta(item: T, indice: number): ReactNode;
  /** Se muestra (en ambos tamaños) cuando `items` está vacío. */
  vacio?: ReactNode;
  /** Nombre accesible de la lista en móvil. */
  etiqueta?: string;
  /** Clases del `<ul>` de tarjetas (móvil). */
  className?: string;
}) {
  const movil = useIsMobile();

  if (items.length === 0 && vacio) return <>{vacio}</>;
  if (!movil) return <>{tabla(items)}</>;

  return (
    <ul role="list" aria-label={etiqueta} className={cn("flex flex-col gap-3", className)}>
      {items.map((item, i) => (
        <li key={clave(item, i)}>{tarjeta(item, i)}</li>
      ))}
    </ul>
  );
}
