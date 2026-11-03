"use client";

// ─── <Monto>: un monto en dos líneas ────────────────────────────────────────
//   Bs 1.250,00
//   ≈ USD 12,40 · BCV 02/10
// Si no recibe `tasa`, usa la del contexto (TasaBCVProvider). `tasa={null}`
// fuerza "sin tasa" (p. ej. para mostrar solo el precio de referencia en USD).

import { formatMoney, type MonedaPago, type TasaRef } from "@/lib/dinero";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { cn } from "@/lib/utils";

const TAMANOS = {
  lg: "text-2xl font-semibold tracking-tight",
  md: "text-base font-medium",
  sm: "text-sm font-medium",
} as const;

export type MontoProps = {
  usd?: number | null;
  bs?: number | null;
  tasa?: TasaRef | null;
  moneda?: MonedaPago;
  size?: keyof typeof TAMANOS;
  align?: "left" | "right";
  className?: string;
};

export function Monto({ usd, bs, tasa, moneda, size = "md", align = "left", className }: MontoProps) {
  const tasaContexto = useTasaBCV();
  const tasaUsada = tasa === undefined ? tasaContexto : tasa;
  const { principal, secundario, accesible } = formatMoney({ usd, bs, tasa: tasaUsada, moneda });

  return (
    <span
      className={cn(
        "inline-flex flex-col leading-tight tabular-nums",
        align === "right" ? "items-end text-right" : "items-start",
        className
      )}
    >
      <span aria-hidden className={cn("whitespace-nowrap", TAMANOS[size])}>
        {principal}
      </span>
      {secundario && (
        <span aria-hidden className="text-xs text-muted-foreground">
          {secundario}
        </span>
      )}
      <span className="sr-only">{accesible}</span>
    </span>
  );
}
