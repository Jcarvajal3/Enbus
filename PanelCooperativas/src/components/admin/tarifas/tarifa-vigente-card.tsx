import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { recargoPorcentaje, type Tarifa } from "@/lib/types/admin-tarifas";
import { CurrencyDollar } from "@phosphor-icons/react/dist/ssr";
import { TarifaProgramadaAviso } from "./tarifa-programada-aviso";

interface TarifaVigenteCardProps {
  tarifa: Tarifa | null;
  /** Tarifa publicada con fecha futura (todavía no se cobra). */
  programada?: Tarifa | null;
}

function Concepto({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-base font-semibold text-foreground tabular-nums">{valor}</dd>
      {ayuda && <dd className="text-xs text-muted-foreground">{ayuda}</dd>}
    </div>
  );
}

export function TarifaVigenteCard({ tarifa, programada = null }: TarifaVigenteCardProps) {
  if (!tarifa) {
    return (
      <Card>
        <EmptyState
          compacto
          icon={CurrencyDollar}
          title="No hay tarifa vigente"
          description={programada ? "La programada empezará a regir en su fecha." : "Publica una con «Nueva tarifa»."}
        />
        {programada && (
          <CardContent>
            <TarifaProgramadaAviso tarifa={programada} />
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarifa vigente</CardTitle>
        <CardAction>
          <StatusBadge status="VIGENTE" dominio="tarifa" />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <Concepto etiqueta="Precio por kilo" valor={formatUsd(tarifa.tarifa_por_kg)} />
          <Concepto
            etiqueta="Recargo por minuto"
            valor={formatNumeroVE(tarifa.factor_distancia_por_min, 4)}
            ayuda={`Viaje de 8 h: +${formatNumeroVE(recargoPorcentaje(tarifa.factor_distancia_por_min, 480), 0)} %`}
          />
          <Concepto etiqueta="Peso máximo" valor={`${formatNumeroVE(tarifa.peso_max_kg, 1)} kg`} />
          <Concepto etiqueta="Medida máxima" valor={`${formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm`} />
        </dl>

        <dl className="grid grid-cols-1 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Vigente desde</dt>
            <dd className="tabular-nums">{formatFechaHoraVE(tarifa.vigente_desde)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Publicada por</dt>
            <dd className="truncate">{tarifa.creador_nombre || "Sistema"}</dd>
          </div>
          {tarifa.nota && (
            <div className="flex flex-col gap-0.5 sm:col-span-2">
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
