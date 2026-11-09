"use client";

// ─── Barra de acción fija de un paso (diálogos de taquilla) ─────────────────
// Pie con el resumen corto de lo elegido y los botones del paso. Es `sticky` al
// fondo del diálogo (que es quien desplaza): siempre se ve, aunque la lista sea
// larga. Al ocupar su lugar en el flujo, nunca tapa el último elemento cuando
// se llega al final. Va como ÚLTIMO hijo del paso: el margen negativo la pega a
// los bordes del diálogo (`p-6`) y el relleno inferior respeta la zona segura.
//
//   <BarraAccion resumen={<>2 asientos · Bs 2.500,00</>}>
//     <Button variant="outline">Atrás</Button>
//     <Button>Continuar</Button>
//   </BarraAccion>

import type { ReactNode } from "react";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { cn } from "@/lib/utils";

/** Total en una línea para el resumen: "Bs 2.500,00" (o "USD 25,00" sin tasa del día). */
export function TotalCorto({ usd, className }: { usd: number; className?: string }) {
  const tasa = useTasaBCV();
  return (
    <span className={cn("font-semibold whitespace-nowrap text-foreground tabular-nums", className)}>
      {tasa ? formatBs(usdABs(usd, tasa.tasa)) : formatUsd(usd)}
    </span>
  );
}

export function BarraAccion({
  resumen,
  children,
  className,
}: {
  /** Resumen corto de lo elegido (viaje, asientos, total). Se anuncia al cambiar. */
  resumen?: ReactNode;
  /** Botones: salida `outline` primero, acción principal al final (§2.3). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="barra-accion"
      className={cn(
        "sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-col gap-3 border-t border-border bg-popover px-6 pt-3",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className
      )}
    >
      {resumen !== undefined && (
        <div className="min-w-0 text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
          {resumen}
        </div>
      )}
      <div
        className={cn(
          // En móvil la acción principal ocupa el ancho que queda (y baja de fila si no cabe);
          // en escritorio los botones van a la derecha y la salida, sin resumen, a la izquierda.
          "flex flex-wrap gap-2 [&>*:last-child]:flex-1",
          "sm:flex-nowrap sm:[&>*:last-child]:flex-none",
          resumen === undefined ? "sm:flex-1 sm:[&>*:first-child]:mr-auto" : "sm:shrink-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}
