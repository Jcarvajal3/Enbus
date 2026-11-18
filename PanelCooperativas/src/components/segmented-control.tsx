"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── SegmentedControl: elegir una vista entre pocas, sin URL ─────────────────
// Pista `surface-dark`, pastilla blanca con sombra en la activa, alto 44. Para
// pestañas con contenido propio usa `Tabs`; para filtros en la URL, `TabsUrl`.
// Aquí el valor lo lleva quien lo usa (estado local). Flechas para moverse.

export type OpcionSegmentada<T extends string> = {
  valor: T;
  etiqueta: string;
  icono?: ReactNode;
  conteo?: number;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  opciones,
  etiqueta,
  className,
  bloque = false,
}: {
  value: T;
  onChange(valor: T): void;
  opciones: OpcionSegmentada<T>[];
  /** Nombre accesible del grupo. */
  etiqueta: string;
  className?: string;
  /** Ocupa todo el ancho y reparte las opciones por igual. */
  bloque?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const alPulsar = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const i = opciones.findIndex((o) => o.valor === value);
    const destino = opciones[(i + paso + opciones.length) % opciones.length];
    onChange(destino.valor);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    // El grupo solo reparte el foco con flechas; cada opción es un botón con role="radio".
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      ref={ref}
      role="radiogroup"
      aria-label={etiqueta}
      onKeyDown={alPulsar}
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-dark p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        bloque && "flex w-full",
        className
      )}
    >
      {opciones.map((o) => {
        const activa = o.valor === value;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa ? 0 : -1}
            onClick={() => onChange(o.valor)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent-strong/30 [&_svg]:size-4",
              bloque && "flex-1",
              activa ? "bg-card text-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.icono}
            {o.etiqueta}
            {o.conteo !== undefined && o.conteo > 0 && (
              <span className="min-w-5 rounded-full bg-surface-dark px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums">
                {o.conteo}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
