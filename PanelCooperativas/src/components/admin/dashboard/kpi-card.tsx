import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }>;
  variant?: "default" | "warning";
  /** Short context label below the value. Defaults to "Hoy". */
  description?: string;
  /** Línea secundaria bajo el valor, p. ej. "≈ USD 12,40 · a la tasa de cada pago". */
  detail?: string | null;
}

export function KPICard({ title, value, icon: Icon, variant = "default", description = "Hoy", detail }: KPICardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      variant === "warning" && "border-amber-600/40 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10"
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", variant === "warning" ? "text-warning-text" : "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tracking-tight tabular-nums", variant === "warning" && "text-warning-text")}>
          {value}
        </div>
        {detail && <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
