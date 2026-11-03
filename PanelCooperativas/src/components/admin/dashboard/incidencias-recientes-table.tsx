import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { etiquetaTipoIncidencia } from "@/lib/estados";
import { formatFechaVE } from "@/lib/fechas";
import { IncidenciaReciente } from "@/lib/types/admin-dashboard";

interface IncidenciasRecientesTableProps {
  data: IncidenciaReciente[];
}

/** Mismo código que ve el usuario al reportar ("INC-1A2B3C"). */
function codigoIncidencia(id: string): string {
  return `INC-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function IncidenciasRecientesTable({ data }: IncidenciasRecientesTableProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Incidencias recientes</CardTitle>
        <CardDescription>Las últimas 10 abiertas o en proceso.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incidencia</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Encomienda</TableHead>
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
                  <TableRow key={item.id} className="transition-colors hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium">
                      <Link
                        href={`/admin/incidencias/${item.id}`}
                        className="text-foreground underline decoration-primary underline-offset-4"
                      >
                        {codigoIncidencia(item.id)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{etiquetaTipoIncidencia(item.tipo)}</TableCell>
                    <TableCell>
                      {item.encomienda_tracking_id ? (
                        <span className="font-mono text-xs">{item.encomienda_tracking_id}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.estado} dominio="incidencia" />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatFechaVE(item.created_at)}
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
