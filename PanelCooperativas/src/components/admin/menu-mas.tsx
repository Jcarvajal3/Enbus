"use client";

import type { ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// ─── Menú "Más" (§2.2, AD5-09) ──────────────────────────────────────────────
// Acciones poco frecuentes o destructivas fuera de la vista. En una cabecera es
// un botón `outline` "Más"; en una fila, "⋯" `ghost icon-sm` (con nombre accesible).
// Cada `DropdownMenuItem` abre su `ConfirmDialog` o su diálogo.

export function MenuMas({
  children,
  enFila = false,
  etiqueta = "Más acciones",
}: {
  children: ReactNode;
  /** "⋯" en la última columna de una tabla. */
  enFila?: boolean;
  /** Nombre accesible del "⋯" (p. ej. "Más acciones para Expresos Lara"). */
  etiqueta?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          enFila ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={etiqueta} className="relative z-10" />
          ) : (
            <Button type="button" variant="outline" />
          )
        }
      >
        <DotsThree aria-hidden />
        {!enFila && "Más"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
