"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
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
    <TarjetaTabla
      titulo="Incidencias recientes"
      descripcion="Las últimas 10 abiertas o en proceso."
    >
      <ListaResponsive
        items={data}
        clave={(item) => item.id}
        etiqueta="Incidencias recientes"
        vacio={
          <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
            <Table>
              <TableBody>
                <FilaVacia colSpan={5} icon={Warning} titulo="No hay incidencias abiertas" />
              </TableBody>
            </Table>
          </div>
        }
        tarjeta={(item) => (
          <EntityCard
            href={`/admin/incidencias/${item.id}`}
            etiqueta={`Ver incidencia ${codigoIncidencia(item.id)}`}
            leading={<IconTile icon={Warning} tone="warning" />}
            title={codigoIncidencia(item.id)}
            subtitle={etiquetaTipoIncidencia(item.tipo)}
            badge={<StatusBadge status={item.estado} dominio="incidencia" />}
            meta={formatHaceTiempo(item.created_at)}
          />
        )}
        tabla={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incidencia</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden 2xl:table-cell">Encomienda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Antigüedad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="relative">
                  <CeldaEnlace
                    href={`/admin/incidencias/${item.id}`}
                    etiqueta={`Ver incidencia ${codigoIncidencia(item.id)}`}
                    className="font-mono text-[15px]"
                  >
                    {codigoIncidencia(item.id)}
                  </CeldaEnlace>
                  <TableCell className="hidden md:table-cell">{etiquetaTipoIncidencia(item.tipo)}</TableCell>
                  <TableCell className="hidden font-mono text-[15px] 2xl:table-cell">
                    {item.encomienda_tracking_id || <Vacio />}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.estado} dominio="incidencia" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatHaceTiempo(item.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </TarjetaTabla>
  );
}
