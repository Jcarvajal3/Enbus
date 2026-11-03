import type { ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaKPI } from "@/lib/types/admin-dashboard";

export type { DeltaKPI };

// ─── Tarjeta de KPI (PU-18, AD-06, AD-07) ───────────────────────────────────
// Etiqueta corta, icono `size-5`, valor `text-2xl font-semibold tabular-nums`
// y pie en `text-xs`, con `h-full` para que la fila quede pareja. Con `href`
// toda la tarjeta es un enlace. "warning" = algo por revisar: acento ámbar sobre
// la tarjeta normal (nunca el rojo de error ni un relleno que pese más que el resto).

const TONO_DELTA: Record<DeltaKPI["tendencia"], string> = {
  sube: "text-success-text",
  baja: "text-destructive-text",
  igual: "text-muted-foreground",
  sin_datos: "text-muted-foreground",
};

export function KpiCard({
  title,
  value,
  icon: Icono,
  variant = "default",
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
        "h-full gap-3 px-5 py-5 motion-safe:transition-colors",
        href && "group-hover/kpi:border-input-border",
        aviso && "border-warning/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-sm", aviso ? "font-medium text-warning-text" : "text-muted-foreground")}>{title}</p>
        <Icono className={cn("size-5 shrink-0", aviso ? "text-warning-text" : "text-muted-foreground")} aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "font-semibold tracking-tight text-foreground tabular-nums",
            grande ? "text-3xl" : "text-2xl"
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
            "mt-auto inline-flex items-center gap-1 text-sm font-medium underline-offset-4 group-hover/kpi:underline",
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
      className="group/kpi block h-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {contenido}
    </Link>
  );
}

