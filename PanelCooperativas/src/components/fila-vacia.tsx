import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { TableCell, TableRow } from "@/components/ui/table";

// ─── Vacío dentro de una tabla (Amanecer) ────────────────────────────────────
// Una fila alta que ocupa todas las columnas: IconTile neutro, título sin punto
// final y, si hace falta, una acción.

export function FilaVacia({
  colSpan,
  icon: Icono,
  titulo,
  accion,
  tono = "neutral",
}: {
  colSpan: number;
  icon?: Icon;
  titulo: string;
  accion?: ReactNode;
  /** Color del dominio (coral = encomiendas), como en EmptyState. */
  tono?: IconTileTone;
}) {
  return (
    <TableRow className="h-auto hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-40 whitespace-normal">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {Icono && <IconTile icon={Icono} tone={tono} size="md" />}
          <p className="text-[15px] font-medium text-foreground">{titulo}</p>
          {accion && <div className="flex flex-wrap items-center justify-center gap-3">{accion}</div>}
        </div>
      </TableCell>
    </TableRow>
  );
}
