import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { dateFormatterShort } from "@/lib/utils";
import { IncidenciaReciente } from "@/lib/types/admin-dashboard";

interface IncidenciasRecientesTableProps {
  data: IncidenciaReciente[];
}

export function IncidenciasRecientesTable({ data }: IncidenciasRecientesTableProps) {
  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "ABIERTA":
        return <Badge variant="destructive" className="font-semibold">Abierta</Badge>;
      case "EN_PROCESO":
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-semibold">En Proceso</Badge>;
      case "RESUELTA":
        return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">Resuelta</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "ALERTA_AMARILLA":
        return <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 font-medium">Alerta Amarilla</Badge>;
      case "PERDIDA":
        return <Badge variant="outline" className="border-rose-500 text-rose-600 dark:text-rose-400 font-medium">Pérdida</Badge>;
      default:
        return <Badge variant="outline">{tipo.replace(/_/g, " ")}</Badge>;
    }
  };

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Incidencias Recientes</CardTitle>
        <CardDescription>Últimas 10 incidencias abiertas o en proceso</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incidencia</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tracking ID</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No hay incidencias abiertas.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">
                      <Link href={`/admin/incidencias/${item.id}`} className="hover:underline text-primary">
                        Ver #{item.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{getTipoBadge(item.tipo)}</TableCell>
                    <TableCell>
                      {item.encomienda_tracking_id ? (
                        <span className="font-mono text-xs">{item.encomienda_tracking_id}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getEstadoBadge(item.estado)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {dateFormatterShort.format(new Date(item.created_at))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
