"use client";

// ─── Incidencias (AD5-12, AD5-16) ───────────────────────────────────────────
// Estado, tipo, búsqueda y página se resuelven en el servidor
// (`?estado=&tipo=&q=&pagina=`), ya ordenadas por prioridad y antigüedad.
// Sin `?estado=`: abiertas y en proceso.

import { useMemo } from "react";
import { MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla } from "@/components/paginacion-tabla";
import { PARAM_PAGINA, useParamUrl } from "@/hooks/use-param-url";
import { Vacio } from "@/components/admin/detalle";
import { CATEGORIA_REPORTE, TIPO_INCIDENCIA, etiquetaEstado, etiquetaTipoIncidencia } from "@/lib/estados";
import { formatFechaHoraVE, formatHaceTiempo } from "@/lib/fechas";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatNumeroVE } from "@/lib/dinero";
import {
  codigoIncidencia,
  prioridadIncidencia,
  type FiltroEstadoIncidencia,
  type Incidencia,
  type PaginaIncidencias,
} from "@/lib/types/admin-incidencias";

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
  /** Página ya filtrada, buscada y ordenada en el servidor. */
  resultado: PaginaIncidencias;
  /** Filtros aplicados en el servidor (vienen de la URL). */
  estado: FiltroEstadoIncidencia;
  tipo: string;
  /** Búsqueda aplicada (`?q=`), resuelta en el servidor. */
  q?: string;
  /** Hora del servidor para "hace 3 h" (igual en servidor y navegador). */
  ahora: string;
}

export function IncidenciasTable({ resultado, estado, tipo, q = "", ahora }: IncidenciasTableProps) {
  const fechaAhora = useMemo(() => new Date(ahora), [ahora]);
  // La página vive en `?pagina=`; cambiarla vuelve a pedir la lista al servidor.
  const [, setPaginaUrl] = useParamUrl(PARAM_PAGINA, "1");

  const { incidencias: data, total, pagina, porPagina } = resultado;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const ir = (p: number) => {
    const destino = Math.min(Math.max(1, Math.trunc(p)), paginas);
    setPaginaUrl(destino === 1 ? null : String(destino));
  };
  const hayFiltros = estado !== "pendientes" || (tipo !== "" && tipo !== "all") || q !== "";

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

      {total > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {total <= porPagina
            ? `${total === 1 ? "1 incidencia" : `${formatNumeroVE(total, 0)} incidencias`} · ordenadas por prioridad y antigüedad`
            : `Mostrando ${formatNumeroVE(desde, 0)}–${formatNumeroVE(hasta, 0)} de ${formatNumeroVE(total, 0)} · ordenadas por prioridad y antigüedad`}
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead className="hidden lg:table-cell">Sobre</TableHead>
              <TableHead className="hidden xl:table-cell">Reportada por</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Antigüedad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <FilaVacia
                colSpan={7}
                icon={q ? MagnifyingGlass : Warning}
                titulo={
                  q
                    ? "Ninguna incidencia coincide con la búsqueda"
                    : hayFiltros
                      ? "No hay incidencias con estos filtros"
                      : "No hay incidencias abiertas ni en proceso"
                }
              />
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
                  <TableCell className="hidden xl:table-cell">{item.reportado_por_profile?.nombre_completo || "Sistema"}</TableCell>
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
