"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowsCounterClockwise, CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { CATEGORIA_REPORTE, TIPO_INCIDENCIA, etiquetaEstado, etiquetaTipoIncidencia } from "@/lib/estados";
import { formatFechaHoraVE, formatHaceTiempo } from "@/lib/fechas";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { cn } from "@/lib/utils";
import { formatNumeroVE } from "@/lib/dinero";
import {
  ETIQUETA_PRIORIDAD,
  FILTROS_ESTADO_INCIDENCIA,
  prioridadIncidencia,
  type FiltroEstadoIncidencia,
  type Incidencia,
  type PaginaIncidencias,
  type PrioridadIncidencia,
} from "@/lib/types/admin-incidencias";

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
  "h-9 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const ETIQUETA_FILTRO_ESTADO: Record<FiltroEstadoIncidencia, string> = {
  pendientes: "Abiertas y en proceso",
  ABIERTA: etiquetaEstado("incidencia", "ABIERTA"),
  EN_PROCESO: etiquetaEstado("incidencia", "EN_PROCESO"),
  RESUELTA: etiquetaEstado("incidencia", "RESUELTA"),
  todas: "Todas",
};

const CLASE_PRIORIDAD: Record<PrioridadIncidencia, string> = {
  alta: "bg-destructive-light text-destructive-deep",
  media: "bg-warning-light text-warning-deep",
  baja: "bg-muted text-foreground",
};

export function PrioridadBadge({ incidencia }: { incidencia: Pick<Incidencia, "tipo" | "categoria"> }) {
  const p = prioridadIncidencia(incidencia);
  return (
    <Badge variant="secondary" className={CLASE_PRIORIDAD[p]}>
      {ETIQUETA_PRIORIDAD[p]}
    </Badge>
  );
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
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();
  const [pendiente, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(q);
  const fechaAhora = useMemo(() => new Date(ahora), [ahora]);

  const { incidencias: data, total, pagina, porPagina } = resultado;
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina * porPagina < total;

  /** URL de la lista con los filtros (sin los valores por defecto). */
  const url = (cambios: { estado?: string; tipo?: string; q?: string; pagina?: number }) => {
    const params = new URLSearchParams();
    const e = cambios.estado ?? estado;
    const t = cambios.tipo ?? tipo;
    const texto = (cambios.q ?? q).trim();
    const p = cambios.pagina ?? 1;
    if (e !== "pendientes") params.set("estado", e);
    if (t && t !== "all") params.set("tipo", t);
    if (texto) params.set("q", texto);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  /** Estado, tipo y búsqueda se resuelven en el servidor: cambian la URL y vuelven a la página 1. */
  const navegar = (cambios: { estado?: string; tipo?: string; q?: string }) => {
    startTransition(() => router.push(url(cambios)));
  };

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    navegar({ q: searchTerm });
  };

  const hayFiltros = estado !== "pendientes" || (tipo && tipo !== "all") || q !== "";

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col items-end justify-between gap-4 md:flex-row">
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 md:flex-1">
            <form onSubmit={buscar} role="search" className="space-y-1.5">
              <Label htmlFor={`${uid}-buscar`}>Buscar</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`${uid}-buscar`}
                    type="search"
                    placeholder="Código, descripción, EB-… o BOL-…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-9 pl-9"
                    autoComplete="off"
                    maxLength={80}
                  />
                  <MagnifyingGlass className="absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden />
                </div>
                <Button type="submit" variant="outline" className="h-9" disabled={pendiente}>
                  Buscar
                </Button>
              </div>
            </form>

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-estado`}>Estado</Label>
              <select
                id={`${uid}-estado`}
                value={estado}
                onChange={(e) => navegar({ estado: e.target.value })}
                className={CLASE_SELECT}
              >
                {FILTROS_ESTADO_INCIDENCIA.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_FILTRO_ESTADO[e]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-tipo`}>Tipo</Label>
              <select
                id={`${uid}-tipo`}
                value={tipo || "all"}
                onChange={(e) => navegar({ tipo: e.target.value })}
                className={CLASE_SELECT}
              >
                <option value="all">Todos los tipos</option>
                {Object.keys(TIPO_INCIDENCIA).map((t) => (
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
                setSearchTerm("");
                navegar({ estado: "pendientes", tipo: "all", q: "" });
              }}
              className="h-9 w-full gap-1 md:w-auto"
            >
              <ArrowsCounterClockwise className="size-3.5" aria-hidden />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? "Sin incidencias"
          : total <= porPagina
            ? `${total === 1 ? "1 incidencia" : `${formatNumeroVE(total, 0)} incidencias`} · ordenadas por prioridad y antigüedad`
            : `Mostrando ${formatNumeroVE(desde, 0)}–${formatNumeroVE(hasta, 0)} de ${formatNumeroVE(total, 0)} · ordenadas por prioridad y antigüedad`}
      </p>

      <div className={cn("overflow-hidden rounded-xl border bg-card", pendiente && "opacity-60")} aria-busy={pendiente || undefined}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[130px] py-3">Código</TableHead>
                <TableHead className="py-3">Prioridad</TableHead>
                <TableHead className="py-3">Tipo</TableHead>
                <TableHead className="py-3">Sobre</TableHead>
                <TableHead className="py-3">Reportada por</TableHead>
                <TableHead className="py-3">Estado</TableHead>
                <TableHead className="py-3">Antigüedad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {!hayFiltros
                      ? "No hay incidencias abiertas ni en proceso. Cuando un usuario reporte un problema o una encomienda pase 72 horas en tránsito, aparecerá aquí."
                      : "Ninguna incidencia coincide con los filtros."}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id} className="relative motion-safe:transition-colors">
                    <CeldaEnlace
                      href={`/admin/incidencias/${item.id}`}
                      etiqueta={`Ver incidencia ${codigoIncidencia(item.id)}`}
                      className="py-3.5 font-mono text-sm"
                    >
                      {codigoIncidencia(item.id)}
                    </CeldaEnlace>
                    <TableCell className="py-3.5">
                      <PrioridadBadge incidencia={item} />
                    </TableCell>
                    <TableCell className="py-3.5 text-sm">{tipoConCategoria(item)}</TableCell>
                    <TableCell className="py-3.5">
                      {item.encomienda ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-medium text-foreground">{item.encomienda.tracking_id}</span>
                          <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {item.encomienda.descripcion_contenido}
                          </span>
                        </div>
                      ) : item.boleto ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {formatCodigoBoleto(item.boleto.codigo_boleto)}
                          </span>
                          <span className="text-xs text-muted-foreground">Boleto</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm text-foreground">
                      {item.reportado_por_profile?.nombre_completo || "Sistema"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <StatusBadge status={item.estado} dominio="incidencia" />
                    </TableCell>
                    <TableCell className="py-3.5 text-sm whitespace-nowrap text-muted-foreground">
                      <span className="block text-foreground">{formatHaceTiempo(item.created_at, fechaAhora)}</span>
                      <span className="block text-xs">{formatFechaHoraVE(item.created_at)}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {(hayAnterior || haySiguiente) && (
        <nav aria-label="Páginas de incidencias" className="flex items-center justify-between gap-2">
          {hayAnterior ? (
            <Link href={url({ pagina: pagina - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CaretLeft className="size-4" aria-hidden /> Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          {haySiguiente ? (
            <Link href={url({ pagina: pagina + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Siguiente <CaretRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
