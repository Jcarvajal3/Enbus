"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { esRutaActiva } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { ConteoItem, GrupoBase, ItemBase } from "@/components/app-sidebar";
import type { IconTileTone } from "@/components/icon-tile";
import { HojaGrupo } from "@/components/movil/hoja-grupo";

// ─── Barra de pestañas inferior (móvil, < md) ────────────────────────────────
// Misma idea que la de la app (EnBusApp/DESIGN.md §3): noche flotando, pastilla blanca
// activa que se desliza (transform, duración base, sin rebote). Las pestañas de enlace
// directo navegan; las de grupo abren una hoja inferior con sus secciones. Un grupo con
// un solo ítem para el rol navega directo a él. Mientras está montada marca
// `<html data-pestanas>`, que activa `--alto-pestanas` (globals.css).

const TONO_GRUPO: Record<string, IconTileTone> = {
  boletos: "sky",
  encomiendas: "coral",
  cooperativas: "sky",
  operacion: "coral",
};

const CLASE_PESTANA =
  "relative z-10 flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-xs font-medium outline-none transition-colors duration-(--duration-base) focus-visible:ring-2 focus-visible:ring-sidebar-ring";

const esDirecto = (g: GrupoBase) => g.directo || g.items.length === 1;

export function BarraPestanas({
  grupos,
  conteo,
}: {
  grupos: GrupoBase[];
  conteo: (item: ItemBase) => ConteoItem;
}) {
  const pathname = usePathname();
  const [hojaAbierta, setHojaAbierta] = useState<string | null>(null);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.pestanas = "";
    return () => {
      delete raiz.dataset.pestanas;
    };
  }, []);

  const activa = grupos.findIndex((g) => g.items.some((i) => esRutaActiva(pathname, i.href)));
  const n = grupos.length;
  if (n === 0) return null;

  return (
    <>
      <nav
        aria-label="Principal"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-3xl bg-night p-1.5 shadow-overlay ring-1 ring-night-raised md:hidden"
      >
        <div className="relative">
          <span
            aria-hidden
            style={{ width: `${100 / n}%`, transform: `translateX(${Math.max(activa, 0) * 100}%)` }}
            className={cn(
              "absolute inset-y-0 left-0 rounded-2xl bg-sidebar-accent opacity-0 motion-safe:transition-[transform,opacity] motion-safe:duration-(--duration-base) motion-safe:ease-out",
              activa >= 0 && "opacity-100"
            )}
          />
          <ul className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {grupos.map((grupo, i) => {
              const conteos = grupo.items.map((item) => ({ item, ...conteo(item) }));
              const total = conteos.reduce((suma, c) => suma + (c.n ?? 0), 0);
              const hayAviso = conteos.some((c) => c.n && c.item.tonoContador === "aviso");
              const descripcion = conteos
                .filter((c) => c.n)
                .map((c) => c.descripcion)
                .join(", ");
              const esActiva = i === activa;
              const Icono = grupo.icon;

              const contenido = (
                <>
                  <span className="relative">
                    <Icono aria-hidden className="size-6" weight={esActiva ? "fill" : "regular"} />
                    {total > 0 && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -top-1.5 left-full -ml-2.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-4 font-semibold tabular-nums ring-2",
                          hayAviso ? "bg-warning text-[#202020]" : "bg-accent-strong text-accent-strong-foreground",
                          esActiva ? "ring-sidebar-accent" : "ring-night"
                        )}
                      >
                        {total > 99 ? "99+" : total}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate">{grupo.titulo}</span>
                  {descripcion && <span className="sr-only">{` (${descripcion})`}</span>}
                </>
              );
              const color = esActiva
                ? "text-sidebar-accent-foreground"
                : "text-night-muted hover:text-sidebar-foreground active:text-sidebar-foreground";

              return (
                <li key={grupo.id} className="min-w-0">
                  {esDirecto(grupo) ? (
                    <Link
                      href={grupo.items[0].href}
                      aria-current={esActiva ? "page" : undefined}
                      className={cn(CLASE_PESTANA, color)}
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={hojaAbierta === grupo.id}
                      aria-current={esActiva ? "page" : undefined}
                      onClick={() => setHojaAbierta(grupo.id)}
                      className={cn(CLASE_PESTANA, color)}
                    >
                      {contenido}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {grupos
        .filter((g) => !esDirecto(g))
        .map((g) => (
          <HojaGrupo
            key={g.id}
            grupo={g}
            abierto={hojaAbierta === g.id}
            onAbiertoChange={(a) => setHojaAbierta(a ? g.id : null)}
            pathname={pathname}
            conteo={conteo}
            tono={TONO_GRUPO[g.id] ?? "neutral"}
          />
        ))}
    </>
  );
}
