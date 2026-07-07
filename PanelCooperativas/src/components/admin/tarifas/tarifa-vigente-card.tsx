import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tarifa } from "@/lib/types/admin-tarifas";
import { formatCurrency, dateFormatterShort } from "@/lib/utils";
import { Scales, Ruler, Calendar, User, CheckCircle, Info } from "@phosphor-icons/react/dist/ssr";

interface TarifaVigenteCardProps {
  tarifa: Tarifa | null;
}

export function TarifaVigenteCard({ tarifa }: TarifaVigenteCardProps) {
  if (!tarifa) {
    return (
      <Card className="border-dashed border-muted-foreground/30 bg-muted/5">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Info className="size-10 text-muted-foreground mb-4" />
          <p className="font-semibold text-muted-foreground">No hay tarifa activa</p>
          <p className="text-xs text-muted-foreground max-w-[250px] mt-1">
            Por favor cree una nueva tarifa para activar la simulación y el cálculo de costos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fechaVigencia = new Date(tarifa.vigente_desde);

  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:shadow-lg border-primary/20 bg-gradient-to-br from-card to-primary/5">
      {/* Accent gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-orange-500" />
      
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight">Tarifa Vigente</CardTitle>
          <CardDescription className="text-xs">Parámetros globales de facturación</CardDescription>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 py-1">
          <CheckCircle weight="fill" className="size-3.5" />
          Activa
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/50">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scales className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Tarifa base / Kg</span>
              <span className="text-lg font-bold text-foreground">{formatCurrency(tarifa.tarifa_por_kg)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/50">
            <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              <Scales className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Factor Distancia</span>
              <span className="text-lg font-bold text-foreground">{tarifa.factor_distancia_por_min.toFixed(4)} <span className="text-xs font-normal text-muted-foreground">/min</span></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
              <Scales className="size-3 text-primary" /> Peso máx.
            </span>
            <span className="text-sm font-semibold">{tarifa.peso_max_kg} kg</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
              <Ruler className="size-3 text-primary" /> Dimensión máx.
            </span>
            <span className="text-sm font-semibold">{tarifa.dimensiones_max_cm} cm</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>Vigente desde</span>
              <span className="font-medium text-foreground">{dateFormatterShort.format(fechaVigencia)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>Creado por</span>
              <span className="font-medium text-foreground truncate max-w-[120px]">{tarifa.creador_nombre || "Sistema"}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
