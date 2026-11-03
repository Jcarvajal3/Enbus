import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Monto } from "@/components/monto";
import type { TasaRef } from "@/lib/dinero";
import { CooperativaBalance } from "@/lib/types/admin-dashboard";
import { cn } from "@/lib/utils";

interface CooperativasBalanceTableProps {
  data: CooperativaBalance[];
  /** Tasa BCV de hoy para el equivalente en Bs (null: solo USD). */
  tasa?: TasaRef | null;
}

export function CooperativasBalanceTable({ data, tasa = null }: CooperativasBalanceTableProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Balances de Cooperativas</CardTitle>
        <CardDescription>Comisiones pendientes por cooperativa, en USD de referencia (se pagan en Bs a la tasa BCV del día del pago).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cooperativa</TableHead>
                <TableHead className="text-right">Comisión %</TableHead>
                <TableHead className="text-right">Pendiente (USD)</TableHead>
                <TableHead className="text-right">Ciclos Impagos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No hay cooperativas registradas.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => {
                  const isOverdue = item.ciclos_impagos >= 2;
                  return (
                    <TableRow
                      key={item.cooperativa_id}
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        isOverdue && "bg-destructive/5 hover:bg-destructive/10 dark:bg-destructive/10 dark:hover:bg-destructive/15"
                      )}
                    >
                      <TableCell className="font-medium">
                        <Link href={`/admin/cooperativas/${item.cooperativa_id}`} className="text-foreground underline decoration-primary underline-offset-4">
                          {item.nombre}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{item.comision_porcentaje} %</TableCell>
                      <TableCell className={cn(
                        "text-right font-semibold font-mono",
                        isOverdue ? "text-destructive-text" : (item.monto_pendiente > 0 ? "text-warning-text" : "text-muted-foreground")
                      )}>
                        <Monto usd={item.monto_pendiente} tasa={tasa} moneda="USD" size="sm" align="right" />
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-semibold",
                        isOverdue ? "text-destructive-text" : (item.ciclos_impagos > 0 ? "text-warning-text" : "text-muted-foreground")
                      )}>
                        {item.ciclos_impagos}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
