import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_TARIFA, type EstadoTarifa, type Tarifa } from "@/lib/types/admin-tarifas";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { Clock } from "@phosphor-icons/react/dist/ssr";

interface HistorialTarifasTableProps {
  tarifas: Tarifa[];
}

const CLASE_ESTADO: Record<EstadoTarifa, string> = {
  VIGENTE: "bg-success-light text-success-deep",
  PROGRAMADA: "bg-info-light text-info-deep",
  ANTERIOR: "bg-muted text-foreground",
};

export function HistorialTarifasTable({ tarifas }: HistorialTarifasTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold tracking-tight">Historial de tarifas</CardTitle>
        <CardDescription>Todas las tarifas publicadas, de la más reciente a la más antigua.</CardDescription>
      </CardHeader>
      <CardContent>
        {tarifas.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
            <Clock className="mb-2 size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Todavía no hay tarifas</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Publica la primera con «Nueva tarifa».</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Precio por kilo</TableHead>
                  <TableHead>Recargo por minuto</TableHead>
                  <TableHead>Peso y medida máximos</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Publicada por</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.map((tarifa) => (
                  <TableRow key={tarifa.id}>
                    <TableCell className="py-3 font-semibold tabular-nums">{formatUsd(tarifa.tarifa_por_kg)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatNumeroVE(tarifa.factor_distancia_por_min, 4)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatNumeroVE(tarifa.peso_max_kg, 1)} kg · {formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFechaHoraVE(tarifa.vigente_desde)}
                      {tarifa.nota && <span className="block max-w-[220px] text-xs">Nota: {tarifa.nota}</span>}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                      {tarifa.creador_nombre || "Sistema"}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge variant="secondary" className={CLASE_ESTADO[tarifa.estado]}>
                        {ETIQUETA_ESTADO_TARIFA[tarifa.estado]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
