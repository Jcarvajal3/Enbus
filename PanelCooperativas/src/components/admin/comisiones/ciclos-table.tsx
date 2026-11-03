"use client";

// ─── Ciclos de comisiones (AD5-14, AD5-15, AD5-24, AD5-30) ──────────────────
// Filtros en la URL (`?cooperativa=&estado=&desde=&hasta=`), totales con
// `KpiCard` y el mismo orden en tarjetas, tabla y CSV: Boletos, Encomiendas,
// Comisión. La cooperativa de cada fila lleva a su balance.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Coins, MagnifyingGlass, Receipt, Ticket, Package, Warning } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { KpiCard } from "@/components/kpi-card";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { Monto } from "@/components/monto";
import { formatPorcentaje } from "@/components/admin/cooperativas/cooperativas-table";
import { etiquetaMetodoPago } from "@/lib/estados";
import { formatFechaVE } from "@/lib/fechas";
import type { ComisionCiclo } from "@/lib/types/admin-comisiones";
import type { TasaBCV } from "@/lib/types/pagos";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { RegistrarPagoCicloDialog } from "./registrar-pago-ciclo-dialog";
import { ExportCSVButton } from "./export-csv-button";

/** "02/10/2026 · Pago Móvil · ref. 1234" (sin método en ciclos anteriores a la fase 4). */
export function detallePago(c: Pick<ComisionCiclo, "pagado" | "pagado_at" | "pago_metodo" | "pago_referencia">): string {
  if (!c.pagado) return "";
  const partes: string[] = [];
  if (c.pagado_at) partes.push(formatFechaVE(c.pagado_at));
  if (c.pago_metodo) partes.push(etiquetaMetodoPago(c.pago_metodo));
  if (c.pago_referencia) partes.push(`ref. ${c.pago_referencia}`);
  return partes.join(" · ");
}

interface CiclosTableProps {
  data: ComisionCiclo[];
  cooperativas: { id: string; nombre: string }[];
  /** Tasa BCV de hoy (del servidor). Si no se pasa, se consulta en el navegador. */
  tasa?: TasaBCV | null;
}

export function CiclosTable({ data, cooperativas, tasa: tasaServidor }: CiclosTableProps) {
  const tasa = useTasaBCVAdmin(tasaServidor);
  const searchParams = useSearchParams();
  const [aPagar, setAPagar] = useState<ComisionCiclo | null>(null);

  const cooperativa = searchParams.get("cooperativa") ?? "";
  const estado = searchParams.get("estado") ?? "";
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  const hayFiltros = Boolean(cooperativa || estado || desde || hasta);

  const filtradas = useMemo(
    () =>
      data.filter((item) => {
        if (cooperativa && item.cooperativa_id !== cooperativa) return false;
        if (estado === "pendiente" && item.pagado) return false;
        if (estado === "pagado" && !item.pagado) return false;
        if (desde && item.periodo_inicio < desde) return false;
        if (hasta && item.periodo_fin > hasta) return false;
        return true;
      }),
    [data, cooperativa, estado, desde, hasta]
  );
  const { visibles, pagina, paginas, ir } = usePaginacion(filtradas);

  // Totales de la selección filtrada.
  const totales = useMemo(
    () =>
      filtradas.reduce(
        (acc, c) => {
          acc.boletos += c.total_boletos;
          acc.encomiendas += c.total_encomiendas;
          acc.comisiones += c.monto_comision;
          if (!c.pagado) acc.pendiente += c.monto_comision;
          return acc;
        },
        { boletos: 0, encomiendas: 0, comisiones: 0, pendiente: 0 }
      ),
    [filtradas]
  );

  const monto = (usd: number) => <Monto usd={usd} tasa={tasa} moneda="USD" size="lg" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Ventas de boletos" value={monto(totales.boletos)} icon={Ticket} />
        <KpiCard title="Ventas de encomiendas" value={monto(totales.encomiendas)} icon={Package} />
        <KpiCard title="Comisiones" value={monto(totales.comisiones)} icon={Coins} />
        <KpiCard
          title="Pendiente por cobrar"
          value={monto(totales.pendiente)}
          icon={Warning}
          variant={totales.pendiente > 0 ? "warning" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros
          selects={[
            {
              param: "cooperativa",
              etiqueta: "Cooperativa",
              opciones: cooperativas.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
            },
            {
              param: "estado",
              etiqueta: "Estado",
              todas: "Todos",
              opciones: [
                { valor: "pendiente", etiqueta: "Pendientes" },
                { valor: "pagado", etiqueta: "Pagados" },
              ],
            },
          ]}
          fechas={[
            { param: "desde", etiqueta: "Desde" },
            { param: "hasta", etiqueta: "Hasta" },
          ]}
        />
        <ExportCSVButton data={filtradas} />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cooperativa</TableHead>
              <TableHead className="hidden md:table-cell">Período</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Boletos</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Encomiendas</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Comisión %</TableHead>
              <TableHead className="text-right">Comisión</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <FilaVacia
                colSpan={8}
                icon={hayFiltros ? MagnifyingGlass : Receipt}
                titulo={hayFiltros ? "Ningún ciclo coincide con los filtros" : "Todavía no hay ciclos de comisiones"}
              />
            ) : (
              visibles.map((item) => (
                <TableRow key={item.id} className="relative">
                  <CeldaEnlace
                    href={`/admin/cooperativas/${item.cooperativa_id}?tab=balance`}
                    etiqueta={`Ver el balance de ${item.cooperativa_nombre || "la cooperativa"}`}
                  >
                    {item.cooperativa_nombre || "Cooperativa sin nombre"}
                  </CeldaEnlace>
                  <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                    {formatFechaVE(item.periodo_inicio)} – {formatFechaVE(item.periodo_fin)}
                  </TableCell>
                  <TableCell className="hidden text-right xl:table-cell">
                    <Monto usd={item.total_boletos} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell className="hidden text-right xl:table-cell">
                    <Monto usd={item.total_encomiendas} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">
                    {formatPorcentaje(item.comision_porcentaje)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Monto usd={item.monto_comision} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={String(item.pagado)} dominio="ciclo" />
                    {item.pagado && detallePago(item) && (
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">{detallePago(item)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!item.pagado && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="relative z-10"
                        aria-label={`Registrar pago de ${item.cooperativa_nombre || "la cooperativa"}`}
                        onClick={() => setAPagar(item)}
                      >
                        Registrar pago
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
      </Card>

      <RegistrarPagoCicloDialog ciclo={aPagar} tasa={tasa} onClose={() => setAPagar(null)} />
    </div>
  );
}
