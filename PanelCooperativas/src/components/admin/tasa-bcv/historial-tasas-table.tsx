"use client";

import { ClockCounterClockwise, CurrencyDollar } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TonoBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
import { TarjetaTabla, Vacio } from "@/components/admin/detalle";
import type { HistorialTasaBCV } from "@/lib/data/admin-tasa-bcv";
import { formatNumeroVE } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";

interface HistorialTasasBCVTableProps {
  tasas: HistorialTasaBCV[];
}

export function HistorialTasasBCVTable({ tasas }: HistorialTasasBCVTableProps) {
  return (
    <TarjetaTabla
      titulo="Historial de tasas BCV"
      descripcion="Últimas 60 tasas registradas, de la más reciente a la más antigua."
    >
      <ListaResponsive
        items={tasas}
        clave={(t) => t.fecha}
        etiqueta="Historial de tasas BCV"
        vacio={
          <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
            <Table>
              <TableBody>
                <FilaVacia colSpan={5} icon={ClockCounterClockwise} titulo="Todavía no hay tasas registradas" />
              </TableBody>
            </Table>
          </div>
        }
        tarjeta={(t) => (
          <EntityCard
            leading={<IconTile icon={CurrencyDollar} tone={t.fuente === "manual" ? "sky" : "neutral"} />}
            title={`${formatNumeroVE(t.tasa)} Bs/USD`}
            subtitle={t.motivo ? `${formatFechaVE(t.fecha)} · ${t.motivo}` : formatFechaVE(t.fecha)}
            lineasSubtitulo={2}
            badge={
              <TonoBadge tono={t.fuente === "manual" ? "info" : "neutro"}>
                {t.fuente === "manual" ? "Manual" : "Automática"}
              </TonoBadge>
            }
            meta={t.registrada_por_nombre || "Sistema"}
          />
        )}
        tabla={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Registrada por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.fecha}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatFechaVE(t.fecha)}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                    {formatNumeroVE(t.tasa)} Bs/USD
                  </TableCell>
                  <TableCell>
                    <TonoBadge tono={t.fuente === "manual" ? "info" : "neutro"}>
                      {t.fuente === "manual" ? "Manual" : "Automática"}
                    </TonoBadge>
                  </TableCell>
                  <TableCell className="max-w-60 whitespace-normal">
                    {t.motivo ? <span className="text-[13px] text-muted-foreground">{t.motivo}</span> : <Vacio />}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">
                    {t.registrada_por_nombre || "Sistema"}
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
