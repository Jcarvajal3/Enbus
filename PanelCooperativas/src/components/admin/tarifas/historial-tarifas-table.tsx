import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { TarjetaTabla } from "@/components/admin/detalle";
import type { Tarifa } from "@/lib/types/admin-tarifas";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

interface HistorialTarifasTableProps {
  tarifas: Tarifa[];
}

export function HistorialTarifasTable({ tarifas }: HistorialTarifasTableProps) {
  return (
    <TarjetaTabla titulo="Historial de tarifas" descripcion="De la más reciente a la más antigua.">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">Por kilo</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Por minuto</TableHead>
            <TableHead className="hidden text-right md:table-cell">Peso y medida</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead className="hidden xl:table-cell">Publicada por</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tarifas.length === 0 ? (
            <FilaVacia colSpan={6} icon={ClockCounterClockwise} titulo="Todavía no hay tarifas" />
          ) : (
            tarifas.map((tarifa) => (
              <TableRow key={tarifa.id}>
                <TableCell className="text-right font-medium tabular-nums">{formatUsd(tarifa.tarifa_por_kg)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumeroVE(tarifa.factor_distancia_por_min, 4)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {formatNumeroVE(tarifa.peso_max_kg, 1)} kg · {formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm
                </TableCell>
                <TableCell className="whitespace-normal">
                  <span className="block whitespace-nowrap tabular-nums">{formatFechaHoraVE(tarifa.vigente_desde)}</span>
                  {tarifa.nota && <span className="block max-w-56 text-xs text-muted-foreground">{tarifa.nota}</span>}
                </TableCell>
                <TableCell className="hidden max-w-36 truncate text-muted-foreground xl:table-cell">
                  {tarifa.creador_nombre || "Sistema"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={tarifa.estado} dominio="tarifa" />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TarjetaTabla>
  );
}
