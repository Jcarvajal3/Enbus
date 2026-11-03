"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowsCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORIA_REPORTE, estadosDe, etiquetaEstado, etiquetaTipoIncidencia } from "@/lib/estados";
import { formatFechaHoraVE } from "@/lib/fechas";
import type { Incidencia } from "@/lib/types/admin-incidencias";

interface IncidenciasTableProps {
  data: Incidencia[];
}

/** Mismo código que devuelve fn_reportar_problema al usuario ("INC-1A2B3C"). */
export function codigoIncidencia(id: string): string {
  return `INC-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** "Reporte de usuario · Pago" o la etiqueta del tipo. */
export function tipoConCategoria(item: Pick<Incidencia, "tipo" | "categoria">): string {
  const tipo = etiquetaTipoIncidencia(item.tipo);
  const categoria = item.categoria ? (CATEGORIA_REPORTE as Record<string, string>)[item.categoria] ?? item.categoria : null;
  return categoria ? `${tipo} · ${categoria}` : tipo;
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function IncidenciasTable({ data }: IncidenciasTableProps) {
  const router = useRouter();
  const [tipoFilter, setTipoFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((item) => {
      if (tipoFilter !== "all" && item.tipo !== tipoFilter) return false;
      if (estadoFilter !== "all" && item.estado !== estadoFilter) return false;
      if (query) {
        const campos = [
          item.descripcion,
          item.encomienda?.tracking_id,
          item.boleto?.codigo_boleto,
          codigoIncidencia(item.id),
          item.reportado_por_profile?.nombre_completo,
        ];
        if (!campos.some((c) => (c ?? "").toLowerCase().includes(query))) return false;
      }
      return true;
    });
  }, [data, tipoFilter, estadoFilter, searchTerm]);

  const uniqueTypes = useMemo(() => Array.from(new Set(data.map((item) => item.tipo))), [data]);
  const hayFiltros = tipoFilter !== "all" || estadoFilter !== "all" || searchTerm !== "";

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col items-end justify-between gap-4 md:flex-row">
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 md:flex-1">
            <div className="space-y-1.5">
              <Label htmlFor="incidencias-buscar">Buscar</Label>
              <div className="relative">
                <Input
                  id="incidencias-buscar"
                  type="text"
                  placeholder="Código, descripción, EB-… o BOL-…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-9"
                />
                <MagnifyingGlass className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="incidencias-estado">Estado</Label>
              <select
                id="incidencias-estado"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className={CLASE_SELECT}
              >
                <option value="all">Todos los estados</option>
                {estadosDe("incidencia").map((e) => (
                  <option key={e} value={e}>
                    {etiquetaEstado("incidencia", e)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="incidencias-tipo">Tipo</Label>
              <select
                id="incidencias-tipo"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
                className={CLASE_SELECT}
              >
                <option value="all">Todos los tipos</option>
                {uniqueTypes.map((t) => (
                  <option key={t} value={t}>
                    {etiquetaTipoIncidencia(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hayFiltros && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTipoFilter("all");
                setEstadoFilter("all");
                setSearchTerm("");
              }}
              className="h-9 w-full gap-1 md:w-auto"
            >
              <ArrowsCounterClockwise className="h-3.5 w-3.5" aria-hidden />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[130px] py-3">Código</TableHead>
                <TableHead className="py-3">Tipo</TableHead>
                <TableHead className="py-3">Sobre</TableHead>
                <TableHead className="py-3">Reportada por</TableHead>
                <TableHead className="py-3">Estado</TableHead>
                <TableHead className="py-3">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {data.length === 0
                      ? "No hay incidencias. Cuando un usuario reporte un problema o una encomienda pase 72 horas en tránsito, aparecerá aquí."
                      : "Ninguna incidencia coincide con los filtros."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow
                    key={item.id}
                    onClick={() => router.push(`/admin/incidencias/${item.id}`)}
                    className="cursor-pointer transition-colors"
                  >
                    <TableCell className="py-3.5 font-mono text-xs">
                      <Link
                        href={`/admin/incidencias/${item.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-foreground underline decoration-primary underline-offset-4"
                      >
                        {codigoIncidencia(item.id)}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 text-sm">{tipoConCategoria(item)}</TableCell>
                    <TableCell className="py-3.5">
                      {item.encomienda ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-medium text-foreground">{item.encomienda.tracking_id}</span>
                          <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {item.encomienda.descripcion_contenido}
                          </span>
                        </div>
                      ) : item.boleto ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-medium text-foreground">{item.boleto.codigo_boleto}</span>
                          <span className="text-xs text-muted-foreground">Boleto</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm text-foreground">
                      {item.reportado_por_profile?.nombre_completo || "Sistema"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <StatusBadge status={item.estado} dominio="incidencia" />
                    </TableCell>
                    <TableCell className="py-3.5 text-xs whitespace-nowrap text-muted-foreground">
                      {formatFechaHoraVE(item.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
