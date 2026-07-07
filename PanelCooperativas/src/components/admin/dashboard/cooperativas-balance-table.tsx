import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CooperativaBalance } from "@/lib/types/admin-dashboard";
import { cn } from "@/lib/utils";

interface CooperativasBalanceTableProps {
  data: CooperativaBalance[];
}

export function CooperativasBalanceTable({ data }: CooperativasBalanceTableProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Balances de Cooperativas</CardTitle>
        <CardDescription>Resumen de comisiones pendientes por cooperativa</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cooperativa</TableHead>
                <TableHead className="text-right">Comisión %</TableHead>
                <TableHead className="text-right">Monto Pendiente</TableHead>
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
                        <Link href={`/admin/cooperativas/${item.cooperativa_id}`} className="hover:underline text-primary">
                          {item.nombre}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{item.comision_porcentaje}%</TableCell>
                      <TableCell className={cn(
                        "text-right font-semibold font-mono",
                        isOverdue ? "text-destructive" : (item.monto_pendiente > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")
                      )}>
                        {formatCurrency(item.monto_pendiente)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-semibold",
                        isOverdue ? "text-destructive" : (item.ciclos_impagos > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")
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
