"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { esRutaActiva } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { ConteoItem, GrupoBase, ItemBase } from "@/components/app-sidebar";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ─── Hoja inferior de un grupo del menú (móvil) ──────────────────────────────
// Título del grupo y sus secciones como filas grandes (≥ 64 px): IconTile + nombre
// + contador + chevron. El grupo ya llega filtrado por rol.

export function HojaGrupo({
  grupo,
  abierto,
  onAbiertoChange,
  pathname,
  conteo,
  tono = "neutral",
}: {
  grupo: GrupoBase;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  pathname: string;
  conteo: (item: ItemBase) => ConteoItem;
  tono?: IconTileTone;
}) {
  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="pb-2">
          <SheetTitle>{grupo.titulo}</SheetTitle>
          <SheetDescription className="sr-only">{`Secciones de ${grupo.titulo}`}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col px-3 pb-4">
          {grupo.items.map((item) => {
            const { n, descripcion } = conteo(item);
            const activo = esRutaActiva(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  onClick={() => onAbiertoChange(false)}
                  className={cn(
                    "flex min-h-16 items-center gap-4 rounded-2xl px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:bg-muted",
                    activo && "bg-muted"
                  )}
                >
                  <IconTile icon={item.icon} tone={activo ? "brand" : tono} />
                  <span className={cn("min-w-0 flex-1 truncate text-[17px]", activo ? "font-semibold" : "font-medium")}>
                    {item.title}
                    {descripcion && <span className="sr-only">{` (${descripcion})`}</span>}
                  </span>
                  {n ? (
                    <span
                      aria-hidden
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[13px] font-semibold tabular-nums",
                        item.tonoContador === "aviso"
                          ? "bg-warning-light text-warning-deep"
                          : "bg-muted text-foreground ring-1 ring-border ring-inset"
                      )}
                    >
                      {n > 99 ? "99+" : n}
                    </span>
                  ) : null}
                  <CaretRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
