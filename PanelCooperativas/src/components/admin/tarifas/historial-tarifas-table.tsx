import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Tarifa } from "@/lib/types/admin-tarifas";
import { formatCurrency, dateFormatterShort } from "@/lib/utils";
import { CheckCircle, Clock } from "@phosphor-icons/react/dist/ssr";

interface HistorialTarifasTableProps {
  tarifas: Tarifa[];
}

export function HistorialTarifasTable({ tarifas }: HistorialTarifasTableProps) {
  return (
    <Card className="transition-all duration-200 hover:shadow-md border-border/65">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold tracking-tight">Historial de Tarifas</CardTitle>
        <CardDescription className="text-xs">Registro histórico de configuraciones y vigencias</CardDescription>
      </CardHeader>
      <CardContent>
        {tarifas.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center p-4">
            <Clock className="size-8 text-muted-foreground mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">Sin registros</p>
            <p className="text-xs text-muted-foreground mt-0.5">No se encontraron tarifas en la base de datos.</p>
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Tarifa / Kg</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Factor Dist.</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Límites (Peso/Dim)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Vigente Desde</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Creador</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.map((tarifa) => {
                  const fechaVigencia = new Date(tarifa.vigente_desde);
                  return (
                    <TableRow key={tarifa.id}>
                      <TableCell className="font-semibold text-foreground py-3">
                        {formatCurrency(tarifa.tarifa_por_kg)}
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">
                        {tarifa.factor_distancia_por_min.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {tarifa.peso_max_kg} kg / {tarifa.dimensiones_max_cm} cm
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {dateFormatterShort.format(fechaVigencia)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs truncate max-w-[120px]" title={tarifa.creador_nombre || "Sistema"}>
                        {tarifa.creador_nombre || "Sistema"}
                      </TableCell>
                      <TableCell className="py-3 flex items-center justify-center">
                        {tarifa.activa ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle weight="fill" className="size-3" />
                            Vigente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground border">
                            Histórica
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
