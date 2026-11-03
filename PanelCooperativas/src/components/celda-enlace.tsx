"use client";

// ─── Filas navegables (#59, AD-14, DS-10) ────────────────────────────────────
// Patrón único para tablas cuyas filas abren algo: la primera celda lleva un
// <Link> (o un <button> si abre una hoja o un diálogo) con nombre accesible, y
// su ::after cubre toda la fila, así se abre con clic en cualquier parte, con
// Tab + Enter y desde el lector de pantalla, sin JS extra.
//
// Uso:
//   <TableRow className="relative">            ← "relative" y SIN onClick
//     <CeldaEnlace href={`/…/${id}`} etiqueta={`Ver encomienda ${codigo}`}>{codigo}</CeldaEnlace>
//     <TableCell>…</TableCell>
//     <TableCell><Button className="relative z-10">…</Button></TableCell>  ← otros controles encima
//   </TableRow>
//
// `etiqueta` debe incluir el texto visible de la celda (WCAG 2.5.3), p. ej.
// "Ver encomienda EB-261004-46719". Ninguna otra celda de la fila puede ser
// `relative` (el ::after se posiciona respecto de la fila).

import type { ReactNode } from "react";
import Link from "next/link";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CLASE_ENLACE =
  "font-medium text-foreground outline-none underline-offset-4 hover:underline " +
  "after:absolute after:inset-0 after:content-[''] " +
  "focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring";

export function CeldaEnlace({
  href,
  onAbrir,
  etiqueta,
  children,
  className,
}: {
  href?: string;
  onAbrir?(): void;
  etiqueta: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell className={className}>
      {href ? (
        <Link href={href} aria-label={etiqueta} className={CLASE_ENLACE}>
          {children}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={etiqueta}
          onClick={() => onAbrir?.()}
          className={cn(CLASE_ENLACE, "cursor-pointer text-left")}
        >
          {children}
        </button>
      )}
    </TableCell>
  );
}
