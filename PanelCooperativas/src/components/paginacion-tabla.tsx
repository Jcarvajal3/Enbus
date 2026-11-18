"use client";

import { useCallback, useMemo } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PARAM_PAGINA, useParamUrl } from "@/hooks/use-param-url";

// ─── Paginación de tablas (PN-27, §2.3) ─────────────────────────────────────
// A partir de 25 filas, páginas de 25. La página vive en `?pagina=` (cambiar un
// filtro la reinicia). Va debajo de la tabla, dentro de la misma `Card`:
//
//   const { visibles, pagina, paginas, ir } = usePaginacion(filas);
//   <Card className="gap-0 overflow-hidden p-0">
//     <Table>…{visibles.map(…)}</Table>
//     <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
//   </Card>
//
// En móvil (< md): "Página X de Y" centrado y debajo "Anterior" / "Siguiente" en
// dos botones grandes (48 px) de igual ancho. Misma API y misma lógica.

export const POR_PAGINA = 25;

export function usePaginacion<T>(
  items: T[],
  porPagina: number = POR_PAGINA
): { pagina: number; paginas: number; visibles: T[]; ir(p: number): void } {
  const [valor, setValor] = useParamUrl(PARAM_PAGINA, "1");
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));
  const pedida = Number.parseInt(valor, 10);
  const pagina = Math.min(Math.max(1, Number.isFinite(pedida) ? pedida : 1), paginas);

  const visibles = useMemo(
    () => items.slice((pagina - 1) * porPagina, pagina * porPagina),
    [items, pagina, porPagina]
  );

  const ir = useCallback(
    (p: number) => {
      const destino = Math.min(Math.max(1, Math.trunc(p)), paginas);
      setValor(destino === 1 ? null : String(destino));
    },
    [paginas, setValor]
  );

  return { pagina, paginas, visibles, ir };
}

export function PaginacionTabla({
  pagina,
  paginas,
  onCambio,
}: {
  pagina: number;
  paginas: number;
  onCambio(p: number): void;
}) {
  if (paginas <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col gap-3 border-t border-border px-5 py-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="text-center text-[13px] text-muted-foreground tabular-nums md:text-left" aria-live="polite">
        Página <span className="font-medium text-foreground">{pagina}</span> de{" "}
        <span className="font-medium text-foreground">{paginas}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 md:h-11"
          onClick={() => onCambio(pagina - 1)}
          disabled={pagina <= 1}
        >
          <CaretLeft aria-hidden />
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 md:h-11"
          onClick={() => onCambio(pagina + 1)}
          disabled={pagina >= paginas}
        >
          Siguiente
          <CaretRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
