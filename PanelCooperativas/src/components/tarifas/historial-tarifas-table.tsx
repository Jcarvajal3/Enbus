"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
import { TarjetaTabla } from "@/components/admin/detalle";
import type { Tarifa } from "@/lib/types/tarifas";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { ClockCounterClockwise, CurrencyDollar } from "@phosphor-icons/react";
import { formatPesoKg } from "@/lib/peso";

interface HistorialTarifasTableProps {
  tarifas: Tarifa[];
}

export function HistorialTarifasTable({ tarifas }: HistorialTarifasTableProps) {
  return (
    <TarjetaTabla
      titulo="Historial de tarifas"
      descripcion="De la más reciente a la más antigua."
    >
      <ListaResponsive
        items={tarifas}
        clave={(t) => t.id}
        etiqueta="Historial de tarifas"
        vacio={
          <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
            <Table>
              <TableBody>
                <FilaVacia colSpan={6} icon={ClockCounterClockwise} titulo="Todavía no hay tarifas" />
              </TableBody>
            </Table>
          </div>
        }
        tarjeta={(tarifa) => (
          <EntityCard
            leading={<IconTile icon={CurrencyDollar} tone={tarifa.estado === "VIGENTE" ? "success" : "neutral"} />}
            title={`${formatUsd(tarifa.tarifa_por_kg)} por kilo`}
            subtitle={formatFechaHoraVE(tarifa.vigente_desde)}
            lineasSubtitulo={2}
            badge={<StatusBadge status={tarifa.estado} dominio="tarifa" />}
            meta={`${formatNumeroVE(tarifa.factor_distancia_por_min, 4)} por min`}
          />
        )}
        tabla={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Por kilo</TableHead>
                <TableHead className="hidden text-right md:table-cell">Por minuto</TableHead>
                <TableHead className="hidden text-right 2xl:table-cell">Peso y medida</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="hidden 2xl:table-cell">Publicada por</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((tarifa) => (
                <TableRow key={tarifa.id}>
                  <TableCell className="text-right font-medium tabular-nums">{formatUsd(tarifa.tarifa_por_kg)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatNumeroVE(tarifa.factor_distancia_por_min, 4)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums 2xl:table-cell">
                    {formatPesoKg(tarifa.peso_max_kg)} kg · {formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="block whitespace-nowrap tabular-nums">{formatFechaHoraVE(tarifa.vigente_desde)}</span>
                    {tarifa.nota && <span className="block max-w-56 text-[13px] text-muted-foreground">{tarifa.nota}</span>}
                  </TableCell>
                  <TableCell className="hidden max-w-36 truncate text-muted-foreground 2xl:table-cell">
                    {tarifa.creador_nombre || "Sistema"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tarifa.estado} dominio="tarifa" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </TarjetaTabla>
  );
}
