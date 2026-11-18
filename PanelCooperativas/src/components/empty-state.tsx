import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { cn } from "@/lib/utils";

// ─── Estado vacío (Amanecer) ─────────────────────────────────────────────────
// IconTile del dominio, título sin punto final, una línea y UNA acción (nunca un
// callejón sin salida). `compacto` para tarjetas, diálogos y tablas pequeñas (en
// una tabla, mejor `FilaVacia`). `tono` da el color del dominio (coral para
// encomiendas, sky para boletos). En móvil la acción ocupa todo el ancho (≥ 44 px).

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
  compacto?: boolean;
  tono?: IconTileTone;
}

export function EmptyState({ icon, title, description, action, compacto = false, tono = "neutral" }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compacto ? "gap-3 p-6" : "gap-5 px-6 py-14"
      )}
    >
      <IconTile icon={icon} tone={tono} size={compacto ? "md" : "xl"} />
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground",
            compacto ? "text-[15px]" : "text-[17px]"
          )}
        >
          {title}
        </h3>
        {description && (
          <p className={cn("text-muted-foreground", compacto ? "text-[13px]" : "text-[15px]")}>{description}</p>
        )}
      </div>
      {action && (
        <div className="flex w-full flex-col items-stretch justify-center gap-3 md:w-auto md:flex-row md:flex-wrap md:items-center">
          {action}
        </div>
      )}
    </div>
  );
}
