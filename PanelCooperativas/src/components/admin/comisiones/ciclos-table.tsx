"use client";

import { useState, useMemo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Warning, ArrowsCounterClockwise, Receipt, Coins } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/status-badge";
import { etiquetaCiclo, etiquetaMetodoPago } from "@/lib/estados";
import { RegistrarPagoCicloDialog } from "./registrar-pago-ciclo-dialog";
import { ComisionCiclo } from "@/lib/types/admin-comisiones";
import { ExportCSVButton } from "./export-csv-button";
import { Monto } from "@/components/monto";
import { formatFechaVE } from "@/lib/fechas";
import { formatNumeroVE } from "@/lib/dinero";
import type { TasaBCV } from "@/lib/types/pagos";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";

/** "Pagado el 02/10 · Pago Móvil · ref. 1234" (sin método en ciclos anteriores a la fase 4). */
export function detallePago(c: Pick<ComisionCiclo, "pagado" | "pagado_at" | "pago_metodo" | "pago_referencia">): string {
  if (!c.pagado) return "";
  const partes = [etiquetaCiclo(true, c.pagado_at)];
  if (c.pago_metodo) partes.push(etiquetaMetodoPago(c.pago_metodo));
  if (c.pago_referencia) partes.push(`ref. ${c.pago_referencia}`);
  return partes.join(" · ");
}

interface CiclosTableProps {
  data: ComisionCiclo[];
  /** true si hay más ciclos que el tope cargado (MAX_CICLOS, los más recientes). */
  truncado?: boolean;
  cooperativas: { id: string; nombre: string }[];
  /** Tasa BCV de hoy (del servidor). Si no se pasa, se consulta en el navegador. */
  tasa?: TasaBCV | null;
}

export function CiclosTable({ data, truncado = false, cooperativas, tasa: tasaServidor }: CiclosTableProps) {
  const tasa = useTasaBCVAdmin(tasaServidor);
  const [aPagar, setAPagar] = useState<ComisionCiclo | null>(null);

  // Filters State
  const [cooperativaFilter, setCooperativaFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [desdeFilter, setDesdeFilter] = useState("");
  const [hastaFilter, setHastaFilter] = useState("");

  // Filter logic
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // 1. Cooperativa
      if (cooperativaFilter !== "all" && item.cooperativa_id !== cooperativaFilter) {
        return false;
      }
      // 2. Estado
      if (estadoFilter !== "all") {
        const isPagado = estadoFilter === "pagado";
        if (item.pagado !== isPagado) return false;
      }
      // 3. Desde
      if (desdeFilter && item.periodo_inicio < desdeFilter) {
        return false;
      }
      // 4. Hasta
      if (hastaFilter && item.periodo_fin > hastaFilter) {
        return false;
      }
      return true;
    });
  }, [data, cooperativaFilter, estadoFilter, desdeFilter, hastaFilter]);

  const handleResetFilters = () => {
    setCooperativaFilter("all");
    setEstadoFilter("all");
    setDesdeFilter("");
    setHastaFilter("");
  };

  // Totales de la selección filtrada
  // Sumas en centavos enteros: miles de floats acumulan error de redondeo.
  const totals = useMemo(() => {
    const c = (n: number) => Math.round((Number(n) || 0) * 100);
    const enCentavos = filteredData.reduce(
      (acc, curr) => {
        acc.encomiendas += c(curr.total_encomiendas);
        acc.boletos += c(curr.total_boletos);
        acc.comisiones += c(curr.monto_comision);
        if (!curr.pagado) acc.pendiente += c(curr.monto_comision);
        return acc;
      },
      { encomiendas: 0, boletos: 0, comisiones: 0, pendiente: 0 }
    );
    return {
      encomiendas: enCentavos.encomiendas / 100,
      boletos: enCentavos.boletos / 100,
      comisiones: enCentavos.comisiones / 100,
      pendiente: enCentavos.pendiente / 100,
    };
  }, [filteredData]);

  return (
    <div className="space-y-6">
      {truncado && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
          Se muestran los {formatNumeroVE(data.length, 0)} ciclos más recientes: los totales no incluyen los más antiguos.
        </p>
      )}
      {/* Tarjetas de Resumen Rápido (Basadas en los filtros) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border p-4 rounded-xl flex flex-col justify-between">
          <span className="text-muted-foreground text-xs font-medium">Ventas de encomiendas (USD)</span>
          <Monto usd={totals.encomiendas} tasa={tasa} moneda="USD" size="lg" className="mt-2 text-foreground" />
        </div>
        <div className="bg-card border p-4 rounded-xl flex flex-col justify-between">
          <span className="text-muted-foreground text-xs font-medium">Ventas de boletos (USD)</span>
          <Monto usd={totals.boletos} tasa={tasa} moneda="USD" size="lg" className="mt-2 text-foreground" />
        </div>
        <div className="bg-card border p-4 rounded-xl flex flex-col justify-between">
          <span className="text-muted-foreground text-xs font-medium flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" aria-hidden /> Total de comisiones (USD)
          </span>
          <Monto usd={totals.comisiones} tasa={tasa} moneda="USD" size="lg" className="mt-2 text-foreground" />
        </div>
        <div className="bg-warning-light border border-warning/40 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-warning-deep text-xs font-medium flex items-center gap-1">
            <Warning className="h-3.5 w-3.5" aria-hidden /> Pendiente por cobrar (USD)
          </span>
          <Monto usd={totals.pendiente} tasa={tasa} moneda="USD" size="lg" className="mt-2 text-warning-deep" />
        </div>
      </div>

      {/* Controles de Filtros y Exportación */}
      <div className="bg-card border rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-end justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full lg:w-auto flex-1">
            <div className="space-y-1.5">
              <Label htmlFor="coop_filter" className="text-xs text-muted-foreground">Cooperativa</Label>
              <select
                id="coop_filter"
                value={cooperativaFilter}
                onChange={(e) => setCooperativaFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Todas las cooperativas</option>
                {cooperativas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estado_filter" className="text-xs text-muted-foreground">Estado del pago</Label>
              <select
                id="estado_filter"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Todos los estados</option>
                <option value="pendiente">Pendientes</option>
                <option value="pagado">Pagados</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desde_filter" className="text-xs text-muted-foreground">Desde</Label>
              <input
                id="desde_filter"
                type="date"
                value={desdeFilter}
                onChange={(e) => setDesdeFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hasta_filter" className="text-xs text-muted-foreground">Hasta</Label>
              <input
                id="hasta_filter"
                type="date"
                value={hastaFilter}
                onChange={(e) => setHastaFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex gap-2 w-full lg:w-auto justify-end">
            {(cooperativaFilter !== "all" || estadoFilter !== "all" || desdeFilter || hastaFilter) && (
              <Button
                onClick={handleResetFilters}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-9 gap-1"
              >
                <ArrowsCounterClockwise className="h-3.5 w-3.5" aria-hidden /> Limpiar filtros
              </Button>
            )}
            <ExportCSVButton data={filteredData} />
          </div>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50 border-b">
            <TableRow>
              <TableHead className="text-muted-foreground font-medium p-4">Cooperativa</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4">Período</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Boletos (USD)</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Encomiendas (USD)</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Comisión %</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Comisión (USD)</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-center">Estado</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-center">Pago</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Receipt className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">No hay ciclos de comisiones con estos filtros</p>
                    <p className="text-xs text-muted-foreground">Cambia los filtros o genera un ciclo nuevo.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item) => (
                <TableRow key={item.id} className="transition-colors text-foreground">
                  <TableCell className="p-4 font-semibold text-foreground">
                    {item.cooperativa_nombre || "Desconocida"}
                  </TableCell>
                  <TableCell className="p-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>{formatFechaVE(item.periodo_inicio)}</span>
                      <span className="text-muted-foreground/60">—</span>
                      <span>{formatFechaVE(item.periodo_fin)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    <Monto usd={item.total_boletos} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    <Monto usd={item.total_encomiendas} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    {item.comision_porcentaje} %
                  </TableCell>
                  <TableCell className="p-4 text-right font-bold text-foreground text-sm">
                    <Monto usd={item.monto_comision} tasa={tasa} moneda="USD" size="sm" align="right" />
                  </TableCell>
                  <TableCell className="p-4 text-center">
                    {item.pagado ? (
                      <Badge variant="secondary" className="bg-success-light text-success-deep">
                        {etiquetaCiclo(true, item.pagado_at)}
                      </Badge>
                    ) : (
                      <StatusBadge status="false" dominio="ciclo" />
                    )}
                  </TableCell>
                  <TableCell className="p-4 text-center">
                    {item.pagado ? (
                      <span className="text-xs text-muted-foreground">{detallePago(item)}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
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
      </div>

      <RegistrarPagoCicloDialog ciclo={aPagar} onClose={() => setAPagar(null)} />
    </div>
  );
}
