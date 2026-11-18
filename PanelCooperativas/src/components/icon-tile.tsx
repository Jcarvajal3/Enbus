import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ─── IconTile: el cuadrito con icono duotono (Amanecer) ──────────────────────
// Es por donde entra el color en una vista de tinta y aire: `sky` para datos y
// boletos, `coral` para encomiendas, `brand` para lo de marca, `mint` para lo
// logrado, `neutral` para lo demás. Los tonos de estado (`success`, `warning`,
// `danger`, `info`) toman el color de un estado en listas y KPI. Es decorativo:
// el significado siempre va también en texto.

export type IconTileTone =
  | "neutral"
  | "brand"
  | "sky"
  | "coral"
  | "mint"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONOS: Record<IconTileTone, string> = {
  neutral: "bg-surface text-foreground",
  brand: "bg-primary-light text-primary-text",
  sky: "bg-accent-light text-accent-strong",
  coral: "bg-secondary-light text-chart-2",
  mint: "bg-success-light text-success-text",
  success: "bg-success-light text-success-text",
  warning: "bg-warning-light text-warning-text",
  danger: "bg-destructive-light text-destructive-text",
  info: "bg-info-light text-info-text",
};

const TAMANOS = {
  sm: "size-9 rounded-xl [&_svg]:size-5",
  md: "size-11 rounded-2xl [&_svg]:size-6",
  lg: "size-14 rounded-2xl [&_svg]:size-7",
  xl: "size-16 rounded-3xl [&_svg]:size-8",
} as const;

export function IconTile({
  icon: Icono,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: Icon;
  tone?: IconTileTone;
  size?: keyof typeof TAMANOS;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", TONOS[tone], TAMANOS[size], className)}
    >
      <Icono weight="fill" />
    </span>
  );
}
