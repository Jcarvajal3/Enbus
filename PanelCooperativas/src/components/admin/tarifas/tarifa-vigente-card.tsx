import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { recargoPorcentaje, type Tarifa } from "@/lib/types/admin-tarifas";
import {
  CalendarBlank,
  CheckCircle,
  CurrencyDollar,
  Info,
  Ruler,
  Scales,
  Timer,
  User,
} from "@phosphor-icons/react/dist/ssr";
import { TarifaProgramadaAviso } from "./tarifa-programada-aviso";

interface TarifaVigenteCardProps {
  tarifa: Tarifa | null;
  /** Tarifa publicada con fecha futura (todavía no se cobra). */
  programada?: Tarifa | null;
}

function Concepto({
  icono,
  etiqueta,
  valor,
  ayuda,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: React.ReactNode;
  ayuda?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-background/60 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" aria-hidden>
        {icono}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
        <span className="text-base font-semibold text-foreground tabular-nums">{valor}</span>
        {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
      </div>
    </div>
  );
}

export function TarifaVigenteCard({ tarifa, programada = null }: TarifaVigenteCardProps) {
  if (!tarifa) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Info className="mb-4 size-10 text-muted-foreground" aria-hidden />
          <p className="font-semibold text-foreground">No hay tarifa vigente</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {programada
              ? "Hay una tarifa programada: empezará a regir en su fecha."
              : "Publica una con «Nueva tarifa» para que el simulador y el cálculo de costos funcionen."}
          </p>
          {programada && <TarifaProgramadaAviso tarifa={programada} className="mt-4 w-full text-left" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-4">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight">Tarifa vigente</CardTitle>
          <CardDescription>La que se cobra hoy en todas las cooperativas.</CardDescription>
        </div>
        <Badge variant="secondary" className="gap-1 bg-success-light text-success-deep">
          <CheckCircle weight="fill" className="size-3.5" aria-hidden />
          Vigente
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Concepto
            icono={<CurrencyDollar className="size-5" />}
            etiqueta="Precio por kilo"
            valor={formatUsd(tarifa.tarifa_por_kg)}
          />
          <Concepto
            icono={<Timer className="size-5" />}
            etiqueta="Recargo por minuto de viaje"
            valor={formatNumeroVE(tarifa.factor_distancia_por_min, 4)}
            ayuda={`Para un viaje de 8 h: +${formatNumeroVE(recargoPorcentaje(tarifa.factor_distancia_por_min, 480), 0)} %`}
          />
          <Concepto
            icono={<Scales className="size-5" />}
            etiqueta="Peso máximo"
            valor={`${formatNumeroVE(tarifa.peso_max_kg, 1)} kg`}
          />
          <Concepto
            icono={<Ruler className="size-5" />}
            etiqueta="Medida máxima"
            valor={`${formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm`}
          />
        </div>

        <dl className="grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <CalendarBlank className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <div>
              <dt className="text-xs text-muted-foreground">Vigente desde</dt>
              <dd className="font-medium">{formatFechaHoraVE(tarifa.vigente_desde)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Publicada por</dt>
              <dd className="truncate font-medium">{tarifa.creador_nombre || "Sistema"}</dd>
            </div>
          </div>
          {tarifa.nota && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Nota</dt>
              <dd>{tarifa.nota}</dd>
            </div>
          )}
        </dl>

        {programada && <TarifaProgramadaAviso tarifa={programada} actual={tarifa} />}
      </CardContent>
    </Card>
  );
}
