"use client";

// ─── Cooperativas (AD5-13, AD5-16) ──────────────────────────────────────────
// Búsqueda y estado en la URL (`?q=&estado=`), resueltos en el servidor. Cada
// fila abre la ficha de la cooperativa.

import { Buildings, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { etiquetaEstado } from "@/lib/estados";
import type { Cooperativa } from "@/lib/types/admin-cooperativas";
import { isValidRif } from "@/lib/rif";
import { formatNumeroVE } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const AYUDA_RIF_INCOMPLETO = "Falta el dígito verificador. Edita la cooperativa para completarlo.";

/**
 * Insignia "RIF incompleto" (RIF sin los 9 dígitos, p. ej. guardado antes de validar el formato).
 * No muestra nada si el RIF es válido. Misma forma que `TonoBadge` pendiente, con la ayuda al enfocar.
 */
export function RifIncompletoBadge({ rif, className }: { rif: string | null | undefined; className?: string }) {
  if (isValidRif(rif)) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={`RIF incompleto. ${AYUDA_RIF_INCOMPLETO}`}
        className={cn(
          "inline-flex shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className
        )}
      >
        <TonoBadge tono="pendiente">RIF incompleto</TonoBadge>
      </TooltipTrigger>
      <TooltipContent>{AYUDA_RIF_INCOMPLETO}</TooltipContent>
    </Tooltip>
  );
}

const TONO_ESTADO: Record<string, IconTileTone> = {
  ACTIVA: "success",
  PENDIENTE: "warning",
  RECHAZADA: "danger",
  SUSPENDIDA: "warning",
  DESACTIVADA: "neutral",
};

const ESTADOS_FILTRO = ["PENDIENTE", "RECHAZADA", "ACTIVA", "SUSPENDIDA", "DESACTIVADA"] as const;

/** 10 → "10 %", 7.5 → "7,5 %". */
export function formatPorcentaje(n: number | string): string {
  const v = Number(n);
  const texto = Number.isInteger(v) ? formatNumeroVE(v, 0) : formatNumeroVE(v, 2).replace(/0$/, "");
  return `${texto} %`;
}

/** "4,5 (12)" o "Sin calificaciones" (nunca "0.0 (0)"). */
export function Calificacion({ promedio, total }: { promedio: number | string; total: number }) {
  if (!total) return <span className="text-[13px] text-muted-foreground">Sin calificaciones</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Star weight="fill" className="size-4 text-primary-text" aria-hidden />
      <span className="text-[15px] font-medium text-foreground">{formatNumeroVE(Number(promedio), 1)}</span>
      <span className="text-[13px] text-muted-foreground">
        ({total}
        <span className="sr-only"> {total === 1 ? "calificación" : "calificaciones"}</span>)
      </span>
    </span>
  );
}

interface CooperativasTableProps {
  initialCooperativas: Cooperativa[];
  /** Filtros de la URL (`?estado=&q=`), ya aplicados en el servidor. */
  estado?: string;
  q?: string;
}

export function CooperativasTable({ initialCooperativas, estado = "", q = "" }: CooperativasTableProps) {
  const hayFiltros = Boolean(estado || q);
  const { visibles, pagina, paginas, ir } = usePaginacion(initialCooperativas);

  return (
    <div className="flex flex-col gap-4">
      <BarraFiltros
        busqueda={{ etiqueta: "Buscar", placeholder: "Nombre o RIF" }}
        selects={[
          {
            param: "estado",
            etiqueta: "Estado",
            todas: "Todos",
            opciones: ESTADOS_FILTRO.map((e) => ({ valor: e, etiqueta: etiquetaEstado("cooperativa", e) })),
          },
        ]}
      />

      <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
        <ListaResponsive
          items={visibles}
          clave={(c) => c.id}
          etiqueta="Cooperativas"
          vacio={
            <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
              <Table>
                <TableBody>
                  <FilaVacia
                    colSpan={6}
                    icon={hayFiltros ? MagnifyingGlass : Buildings}
                    titulo={hayFiltros ? "Ninguna cooperativa coincide con los filtros" : "Todavía no hay cooperativas"}
                  />
                </TableBody>
              </Table>
            </div>
          }
          tarjeta={(coop) => (
            <EntityCard
              href={`/admin/cooperativas/${coop.id}`}
              leading={<IconTile icon={Buildings} tone={TONO_ESTADO[coop.estado] ?? "neutral"} />}
              title={coop.nombre}
              subtitle={coop.rif}
              badge={<StatusBadge status={coop.estado} dominio="cooperativa" />}
              meta={formatFechaVE(coop.created_at)}
            />
          )}
          tabla={(items) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">RIF</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Calificación</TableHead>
                  <TableHead className="hidden lg:table-cell">Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((coop) => (
                  <TableRow key={coop.id} className="relative">
                    <CeldaEnlace href={`/admin/cooperativas/${coop.id}`} etiqueta={`Ver cooperativa ${coop.nombre}`}>
                      <span className="flex items-center gap-3">
                        <Avatar className="size-10">
                          <AvatarImage src={coop.logo_url || ""} alt="" />
                          <AvatarFallback className="bg-surface text-[13px] font-semibold text-muted-foreground">
                            {coop.nombre.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{coop.nombre}</span>
                      </span>
                    </CeldaEnlace>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] text-foreground">{coop.rif}</span>
                        <RifIncompletoBadge rif={coop.rif} className="relative z-10" />
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={coop.estado} dominio="cooperativa" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Calificacion promedio={coop.calificacion_promedio} total={coop.total_calificaciones} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                      {formatFechaVE(coop.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        />
        <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
      </Card>
    </div>
  );
}
