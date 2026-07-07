import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }>;
  variant?: "default" | "warning";
  /** Short context label below the value. Defaults to "Hoy". */
  description?: string;
}

export function KPICard({ title, value, icon: Icon, variant = "default", description = "Hoy" }: KPICardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      variant === "warning" && "border-destructive/50 bg-destructive/5 dark:border-destructive/30"
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", variant === "warning" ? "text-destructive" : "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tracking-tight", variant === "warning" && "text-destructive")}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
