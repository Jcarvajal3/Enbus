import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaKPI } from "@/lib/types/admin-dashboard";

// ─── Tarjeta de KPI del Resumen (#54, AD-06, AD-07) ─────────────────────────
// Valor, delta frente a ayer (con texto para lectores de pantalla) y, si tiene
// `href`, toda la tarjeta es un enlace. La variante "warning" (algo por revisar)
// va en ámbar con "Revisar →", nunca en el rojo de error.

interface KPICardProps {
  title: string;
  value: ReactNode;
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" | "duotone"; "aria-hidden"?: boolean }>;
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
}

const TONO_DELTA: Record<DeltaKPI["tendencia"], string> = {
  sube: "text-success-text",
  baja: "text-destructive-text",
  igual: "text-muted-foreground",
  sin_datos: "text-muted-foreground",
};

export function KPICard({
  title,
  value,
  icon: Icon,
  variant = "default",
  description,
  detail,
  delta,
  href,
  accion = "Revisar",
  grande = false,
}: KPICardProps) {
  const aviso = variant === "warning";

  const contenido = (
    <Card
      className={cn(
        "h-full motion-safe:transition-shadow",
        href && "group-hover/kpi:shadow-md",
        aviso && "border-warning/40 bg-warning-light"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className={cn("text-sm font-medium", aviso ? "text-warning-deep" : "text-muted-foreground")}>
          {title}
        </CardTitle>
        <Icon className={cn("size-5", aviso ? "text-warning-deep" : "text-muted-foreground")} aria-hidden />
      </CardHeader>
      <CardContent className="space-y-1">
        <div
          className={cn(
            "font-bold tracking-tight tabular-nums",
            grande ? "text-3xl" : "text-2xl",
            aviso ? "text-warning-deep" : "text-foreground"
          )}
        >
          {value}
        </div>
        {detail && (
          <p className={cn("text-xs tabular-nums", aviso ? "text-warning-deep" : "text-muted-foreground")}>{detail}</p>
        )}
        {delta && (
          <p className={cn("text-xs font-medium tabular-nums", aviso ? "text-warning-deep" : TONO_DELTA[delta.tendencia])}>
            <span aria-hidden>{delta.texto}</span>
            <span className="sr-only">{`${title}: ${delta.accesible}.`}</span>
          </p>
        )}
        {description && (
          <p className={cn("text-xs", aviso ? "text-warning-deep" : "text-muted-foreground")}>{description}</p>
        )}
        {href && (
          <p
            className={cn(
              "inline-flex items-center gap-1 pt-1 text-sm font-medium underline-offset-4 group-hover/kpi:underline",
              aviso ? "text-warning-deep" : "text-foreground"
            )}
          >
            {accion} <ArrowRight className="size-3.5" aria-hidden />
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (!href) return contenido;
  return (
    <Link
      href={href}
      className="group/kpi block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {contenido}
    </Link>
  );
}
