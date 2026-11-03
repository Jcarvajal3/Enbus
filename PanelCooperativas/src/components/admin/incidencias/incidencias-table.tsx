"use client";

// ─── Incidencias (AD5-12, AD5-16) ───────────────────────────────────────────
// Estado y tipo se filtran en el servidor (`?estado=&tipo=`); la búsqueda
// (`?q=`) filtra la lista cargada. Sin `?estado=`: abiertas y en proceso.

import { useMemo } from "react";
import { MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { useParamUrl } from "@/hooks/use-param-url";
import { Vacio } from "@/components/admin/detalle";
import { CATEGORIA_REPORTE, TIPO_INCIDENCIA, etiquetaEstado, etiquetaTipoIncidencia } from "@/lib/estados";
import { formatFechaHoraVE, formatHaceTiempo } from "@/lib/fechas";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { codigoIncidencia, prioridadIncidencia, type Incidencia } from "@/lib/types/admin-incidencias";

/** "Reporte de usuario · Pago" o la etiqueta del tipo. */
export function tipoConCategoria(item: Pick<Incidencia, "tipo" | "categoria">): string {
  const tipo = etiquetaTipoIncidencia(item.tipo);
  const categoria = item.categoria ? (CATEGORIA_REPORTE as Record<string, string>)[item.categoria] ?? item.categoria : null;
  return categoria ? `${tipo} · ${categoria}` : tipo;
}

/** Prioridad de atención con su tono (Alta peligro · Media pendiente · Baja neutro). */
export function PrioridadBadge({ incidencia }: { incidencia: Pick<Incidencia, "tipo" | "categoria"> }) {
  return <StatusBadge status={prioridadIncidencia(incidencia)} dominio="prioridad" />;
}

interface IncidenciasTableProps {
  data: Incidencia[];
  /** Hora del servidor para "hace 3 h" (igual en servidor y navegador). */
  ahora: string;
}

export function IncidenciasTable({ data, ahora }: IncidenciasTableProps) {
  const [q] = useParamUrl("q");
  const fechaAhora = useMemo(() => new Date(ahora), [ahora]);

  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return data;
    return data.filter((item) => {
      const campos = [
        item.descripcion,
        item.encomienda?.tracking_id,
        item.boleto?.codigo_boleto,
        item.boleto ? formatCodigoBoleto(item.boleto.codigo_boleto) : null,
        codigoIncidencia(item.id),
        item.reportado_por_profile?.nombre_completo,
      ];
      return campos.some((c) => (c ?? "").toLowerCase().includes(query));
    });
  }, [data, q]);
  const { visibles, pagina, paginas, ir } = usePaginacion(filtradas);

  return (
    <div className="flex flex-col gap-4">
      <BarraFiltros
        busqueda={{ etiqueta: "Buscar", placeholder: "INC-…, EB-…, BOL-… o descripción" }}
        selects={[
          {
            param: "estado",
            etiqueta: "Estado",
            todas: "Sin resolver",
            opciones: [
              ...(["ABIERTA", "EN_PROCESO", "RESUELTA"] as const).map((e) => ({
                valor: e,
                etiqueta: etiquetaEstado("incidencia", e),
              })),
              { valor: "todas", etiqueta: "Todas" },
            ],
          },
          {
            param: "tipo",
            etiqueta: "Tipo",
            todas: "Todos",
            opciones: Object.keys(TIPO_INCIDENCIA).map((t) => ({ valor: t, etiqueta: etiquetaTipoIncidencia(t) })),
          },
        ]}
      />

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead className="hidden lg:table-cell">Sobre</TableHead>
              <TableHead className="hidden lg:table-cell">Reportada por</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Antigüedad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <FilaVacia
                colSpan={7}
                icon={q ? MagnifyingGlass : Warning}
                titulo={q ? "Ninguna incidencia coincide con la búsqueda" : "No hay incidencias con estos filtros"}
              />
            ) : (
              visibles.map((item) => (
                <TableRow key={item.id} className="relative">
                  <CeldaEnlace
                    href={`/admin/incidencias/${item.id}`}
                    etiqueta={`Ver incidencia ${codigoIncidencia(item.id)}`}
                    className="font-mono text-sm"
                  >
                    {codigoIncidencia(item.id)}
                  </CeldaEnlace>
                  <TableCell>
                    <PrioridadBadge incidencia={item} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{tipoConCategoria(item)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {item.encomienda ? (
                      <>
                        <span className="block font-mono text-sm text-foreground">{item.encomienda.tracking_id}</span>
                        <span className="block max-w-52 truncate text-xs text-muted-foreground">
                          {item.encomienda.descripcion_contenido}
                        </span>
                      </>
                    ) : item.boleto ? (
                      <>
                        <span className="block font-mono text-sm text-foreground">{formatCodigoBoleto(item.boleto.codigo_boleto)}</span>
                        <span className="block text-xs text-muted-foreground">Boleto</span>
                      </>
                    ) : (
                      <Vacio />
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{item.reportado_por_profile?.nombre_completo || "Sistema"}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.estado} dominio="incidencia" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="block">{formatHaceTiempo(item.created_at, fechaAhora)}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{formatFechaHoraVE(item.created_at)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
      </Card>
    </div>
  );
}
