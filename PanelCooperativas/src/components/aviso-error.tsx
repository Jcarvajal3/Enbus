import type { ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

// ─── Error dentro de un diálogo o formulario (§2.3) ─────────────────────────
// Se lee donde ocurrió, nunca como toast. Tono peligro: fondo `destructive-light`,
// texto `destructive-deep`, icono `WarningCircle` fill.

export function AvisoError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-light p-3 text-sm text-destructive-deep",
        className
      )}
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive-text" weight="fill" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
