import type { ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { cn } from "@/lib/utils";
import type { DeltaKPI } from "@/lib/types/admin-dashboard";

export type { DeltaKPI };

// ─── Tarjeta de KPI (Amanecer) ──────────────────────────────────────────────
// IconTile duotono + etiqueta de 13, cifra grande `tabular-nums` y pie de 12.
// `h-full` para que la fila quede pareja. Con `href` toda la tarjeta es un
// enlace. "warning" = algo por revisar: IconTile ámbar y anillo suave (nunca el
// rojo de error ni un relleno que pese más que el resto). `tono` colorea el
// IconTile en el caso normal (por defecto `sky`; `coral` para encomiendas).

const TONO_DELTA: Record<DeltaKPI["tendencia"], string> = {
  sube: "text-success-text",
  baja: "text-destructive-text",
  igual: "text-muted-foreground",
  sin_datos: "text-muted-foreground",
};

export function KpiCard({
  title,
  value,
  icon,
  variant = "default",
  tono = "sky",
  description,
  detail,
  delta,
  href,
  accion = "Revisar",
  grande = false,
}: {
  title: string;
  value: ReactNode;
  icon: Icon;
  variant?: "default" | "warning";
  /** Color del IconTile cuando `variant` es "default". */
  tono?: IconTileTone;
  /** Contexto bajo el valor ("Registradas hoy"). */
  description?: string;
  /** Línea secundaria bajo el valor, p. ej. "≈ USD 12,40 · a la tasa de cada pago". */
  detail?: string | null;
  delta?: DeltaKPI | null;
  /** Enlace de la tarjeta completa (p. ej. a la lista que hay que revisar). */
  href?: string;
  /** Texto de la acción cuando hay `href` (por defecto "Revisar"). */
  accion?: string;
  /** Tarjeta grande (banda "Finanzas de hoy"). */
  grande?: boolean;
}) {
  const aviso = variant === "warning";

  const contenido = (
    <Card
      className={cn(
        "h-full gap-3 px-4 py-4 motion-safe:transition-shadow md:gap-4 md:px-5 md:py-5",
        href && "group-hover/kpi:shadow-raised",
        aviso && "ring-1 ring-warning/40"
      )}
    >
      <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:gap-3">
        <IconTile icon={icon} tone={aviso ? "warning" : tono} size="md" />
        <p className={cn("text-[13px] leading-snug", aviso ? "font-medium text-warning-text" : "text-muted-foreground")}>
          {title}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground tabular-nums",
            grande ? "text-[32px] leading-tight md:text-[40px]" : "text-[24px] leading-tight break-words md:text-[28px]"
          )}
        >
          {value}
        </div>
        {detail && <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>}
        {delta && (
          <p className={cn("text-xs font-medium tabular-nums", TONO_DELTA[delta.tendencia])}>
            <span aria-hidden>{delta.texto}</span>
            <span className="sr-only">{`${title}: ${delta.accesible}.`}</span>
          </p>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {href && (
        <p
          className={cn(
            "mt-auto inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 group-hover/kpi:underline",
            aviso ? "text-warning-text" : "text-foreground"
          )}
        >
          {accion} <ArrowRight className="size-4" aria-hidden />
        </p>
      )}
    </Card>
  );

  if (!href) return contenido;
  return (
    <Link
      href={href}
      className="group/kpi block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-accent-strong/30"
    >
      {contenido}
    </Link>
  );
}
