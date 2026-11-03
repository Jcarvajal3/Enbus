"use client";

import Link from "next/link";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { etiquetaEstado } from "@/lib/estados";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowsCounterClockwise, MagnifyingGlass, Star } from "@phosphor-icons/react";
import type { Cooperativa } from "@/lib/types/admin-cooperativas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidRif } from "@/lib/rif";
import { formatNumeroVE } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const AYUDA_RIF_INCOMPLETO = "Falta el dígito verificador. Edita la cooperativa para completarlo.";

/**
 * Insignia "RIF incompleto" (RIF sin los 9 dígitos, p. ej. guardado antes de validar el formato).
 * No muestra nada si el RIF es válido.
 */
export function RifIncompletoBadge({ rif, className }: { rif: string | null | undefined; className?: string }) {
  if (isValidRif(rif)) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={`RIF incompleto. ${AYUDA_RIF_INCOMPLETO}`}
        className={cn(
          "inline-flex h-5 shrink-0 items-center rounded-4xl border border-transparent bg-warning-light px-2 text-xs font-medium whitespace-nowrap text-warning-deep outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className
        )}
      >
        RIF incompleto
      </TooltipTrigger>
      <TooltipContent>{AYUDA_RIF_INCOMPLETO}</TooltipContent>
    </Tooltip>
  );
}

const ESTADOS_FILTRO = ["PENDIENTE", "RECHAZADA", "ACTIVA", "SUSPENDIDA", "DESACTIVADA"] as const;

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** 10 → "10 %", 7.5 → "7,5 %". */
export function formatPorcentaje(n: number | string): string {
  const v = Number(n);
  const texto = Number.isInteger(v) ? formatNumeroVE(v, 0) : formatNumeroVE(v, 2).replace(/0$/, "");
  return `${texto} %`;
}

/** "Pendiente de aprobación" con el enlace a Solicitudes, donde se aprueba (AD-14, A-04). */
export function PendienteAprobacion({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <Badge variant="secondary" className="bg-warning-light text-warning-deep">
        Pendiente de aprobación
      </Badge>
      <Link
        href="/admin/solicitudes"
        className="relative z-10 text-sm text-foreground underline decoration-primary underline-offset-4"
      >
        Revisar solicitud
      </Link>
    </div>
  );
}

/** "4,5 (12)" o "Sin calificaciones" (nunca "0.0 (0)"). */
export function Calificacion({ promedio, total }: { promedio: number | string; total: number }) {
  if (!total) return <span className="text-sm text-muted-foreground">Sin calificaciones</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star weight="fill" className="size-4 text-primary-text" aria-hidden />
      <span className="text-sm font-medium text-foreground">{formatNumeroVE(Number(promedio), 1)}</span>
      <span className="text-sm text-muted-foreground">
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
  const router = useRouter();
  const uid = useId();
  const [pendiente, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  const navegar = (cambios: { estado?: string; q?: string }) => {
    const params = new URLSearchParams();
    const e = cambios.estado ?? estado;
    const texto = (cambios.q ?? search).trim();
    if (e) params.set("estado", e);
    if (texto) params.set("q", texto);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/admin/cooperativas?${qs}` : "/admin/cooperativas"));
  };

  const buscar = (ev: FormEvent) => {
    ev.preventDefault();
    navegar({ q: search });
  };

  const hayFiltros = Boolean(estado || q);

  return (
    <div className="space-y-4">
      {/* Filtros (en la URL) */}
      <div className="grid grid-cols-1 items-end gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_220px_auto]">
        <form onSubmit={buscar} role="search" className="space-y-1.5">
          <Label htmlFor={`${uid}-q`}>Buscar</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`${uid}-q`}
                type="search"
                placeholder="Nombre o RIF"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pendiente}>
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
            <option value="">Todos los estados</option>
            {ESTADOS_FILTRO.map((e) => (
              <option key={e} value={e}>
                {etiquetaEstado("cooperativa", e)}
              </option>
            ))}
          </select>
        </div>
        {hayFiltros ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setSearch("");
              startTransition(() => router.push("/admin/cooperativas"));
            }}
          >
            <ArrowsCounterClockwise className="size-3.5" aria-hidden /> Limpiar filtros
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
      </div>

      {/* Tabla */}
      <div className={cn("overflow-hidden rounded-xl border bg-card", pendiente && "opacity-60")} aria-busy={pendiente || undefined}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nombre</TableHead>
                <TableHead>RIF</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead className="text-center">Calificación</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Registro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCooperativas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {hayFiltros
                      ? "Ninguna cooperativa coincide con la búsqueda o el estado."
                      : "Todavía no hay cooperativas. Crea una con «Nueva cooperativa» o espera las solicitudes."}
                  </TableCell>
                </TableRow>
              ) : (
                initialCooperativas.map((coop) => (
                  <TableRow key={coop.id} className="relative motion-safe:transition-colors">
                    <CeldaEnlace href={`/admin/cooperativas/${coop.id}`} etiqueta={`Ver cooperativa ${coop.nombre}`} className="py-3">
                      <span className="flex items-center gap-3">
                        <Avatar className="size-9 border">
                          <AvatarImage src={coop.logo_url || ""} alt="" />
                          <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                            {coop.nombre.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{coop.nombre}</span>
                      </span>
                    </CeldaEnlace>
                    <TableCell className="py-3 text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm">{coop.rif}</span>
                        <RifIncompletoBadge rif={coop.rif} className="relative z-10" />
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {coop.estado === "PENDIENTE" ? (
                        <PendienteAprobacion />
                      ) : (
                        <StatusBadge status={coop.estado} dominio="cooperativa" />
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right font-semibold text-foreground">
                      {formatPorcentaje(coop.comision_porcentaje)}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Calificacion promedio={coop.calificacion_promedio} total={coop.total_calificaciones} />
                    </TableCell>
                    <TableCell className="hidden py-3 text-right text-sm text-muted-foreground lg:table-cell">
                      {formatFechaVE(coop.created_at)}
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
