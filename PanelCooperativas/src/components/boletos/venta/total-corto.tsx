"use client";

import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { cn } from "@/lib/utils";

/** Total en una línea para el resumen de la barra: "Bs 2.500,00" (o "USD 25,00" sin tasa del día). */
export function TotalCorto({ usd, className }: { usd: number; className?: string }) {
  const tasa = useTasaBCV();
  return (
    <span className={cn("font-semibold whitespace-nowrap text-foreground tabular-nums", className)}>
      {tasa ? formatBs(usdABs(usd, tasa.tasa)) : formatUsd(usd)}
    </span>
  );
}
