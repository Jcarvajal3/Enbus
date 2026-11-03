import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ─── Estado vacío (§2.3, PU-15, SY-26) ───────────────────────────────────────
// Icono del dominio en peso regular, título sin punto final, una línea y una
// acción. `compacto` para tarjetas, diálogos y tablas pequeñas (en una tabla,
// mejor `FilaVacia`).

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
  compacto?: boolean;
}

export function EmptyState({ icon: IconComponent, title, description, action, compacto = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compacto ? "gap-3 p-6" : "gap-4 p-12"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted",
          compacto ? "size-10" : "size-16"
        )}
      >
        <IconComponent className={cn("text-muted-foreground", compacto ? "size-5" : "size-8")} aria-hidden />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className={cn("font-semibold text-foreground", compacto ? "text-sm" : "text-base")}>{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
