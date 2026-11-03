import { Warning } from "@phosphor-icons/react/dist/ssr";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { TarjetaTabla, Vacio } from "@/components/admin/detalle";
import { etiquetaTipoIncidencia } from "@/lib/estados";
import { formatHaceTiempo } from "@/lib/fechas";
import type { IncidenciaReciente } from "@/lib/types/admin-dashboard";
import { codigoIncidencia } from "@/lib/types/admin-incidencias";

interface IncidenciasRecientesTableProps {
  data: IncidenciaReciente[];
}

export function IncidenciasRecientesTable({ data }: IncidenciasRecientesTableProps) {
  return (
    <TarjetaTabla titulo="Incidencias recientes" descripcion="Las últimas 10 abiertas o en proceso.">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Incidencia</TableHead>
            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
            <TableHead className="hidden 2xl:table-cell">Encomienda</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Antigüedad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <FilaVacia colSpan={5} icon={Warning} titulo="No hay incidencias abiertas" />
          ) : (
            data.map((item) => (
              <TableRow key={item.id} className="relative">
                <CeldaEnlace
                  href={`/admin/incidencias/${item.id}`}
                  etiqueta={`Ver incidencia ${codigoIncidencia(item.id)}`}
                  className="font-mono text-sm"
                >
                  {codigoIncidencia(item.id)}
                </CeldaEnlace>
                <TableCell className="hidden sm:table-cell">{etiquetaTipoIncidencia(item.tipo)}</TableCell>
                <TableCell className="hidden font-mono text-sm 2xl:table-cell">
                  {item.encomienda_tracking_id || <Vacio />}
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.estado} dominio="incidencia" />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatHaceTiempo(item.created_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TarjetaTabla>
  );
}
