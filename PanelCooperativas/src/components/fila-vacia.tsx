import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { TableCell, TableRow } from "@/components/ui/table";

// ─── Vacío dentro de una tabla (§2.3, PU-15) ────────────────────────────────
// Una fila de 128 px que ocupa todas las columnas: icono regular, título sin
// punto final y, si hace falta, una acción.

export function FilaVacia({
  colSpan,
  icon: Icono,
  titulo,
  accion,
}: {
  colSpan: number;
  icon?: Icon;
  titulo: string;
  accion?: ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-32 whitespace-normal">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {Icono && <Icono className="size-6 text-muted-foreground" aria-hidden />}
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          {accion && <div className="flex flex-wrap items-center justify-center gap-2">{accion}</div>}
        </div>
      </TableCell>
    </TableRow>
  );
}
