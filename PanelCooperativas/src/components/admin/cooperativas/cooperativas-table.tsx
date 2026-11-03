"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { etiquetaEstado } from "@/lib/estados";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MagnifyingGlass, Funnel } from "@phosphor-icons/react";
import type { Cooperativa } from "@/lib/types/admin-cooperativas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidRif } from "@/lib/rif";
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
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex h-5 shrink-0 items-center rounded-4xl border border-transparent bg-amber-100 px-2 text-xs font-medium whitespace-nowrap text-amber-900 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-amber-400/15 dark:text-amber-200",
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
// Etiqueta del valor elegido: sin `items`, el Select muestra el valor crudo ("ALL", "PENDIENTE").
const ITEMS_ESTADO: Record<string, string> = {
  ALL: "Todos los estados",
  ...Object.fromEntries(ESTADOS_FILTRO.map((e) => [e, etiquetaEstado("cooperativa", e)])),
};

interface CooperativasTableProps {
  initialCooperativas: Cooperativa[];
}

export function CooperativasTable({ initialCooperativas }: CooperativasTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");

  // Filtering on client side for instantaneous interaction, but could also sync with searchParams if needed
  const filteredCooperativas = initialCooperativas.filter((coop) => {
    const matchesSearch = 
      coop.nombre.toLowerCase().includes(search.toLowerCase()) ||
      coop.rif.toLowerCase().includes(search.toLowerCase());
    
    const matchesEstado = estadoFilter === "ALL" || coop.estado === estadoFilter;

    return matchesSearch && matchesEstado;
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar cooperativa"
            placeholder="Buscar por nombre o RIF"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Funnel className="h-4 w-4 text-muted-foreground" />
          <Select value={estadoFilter} onValueChange={(val) => setEstadoFilter(val ?? "ALL")} items={ITEMS_ESTADO}>
            <SelectTrigger aria-label="Filtrar por estado" className="w-[180px] bg-background border-input text-foreground">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent className="bg-popover border text-popover-foreground">
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {ESTADOS_FILTRO.map((e) => (
                <SelectItem key={e} value={e}>
                  {etiquetaEstado("cooperativa", e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50 border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground w-[80px]">Logo</TableHead>
              <TableHead className="text-muted-foreground">Nombre</TableHead>
              <TableHead className="text-muted-foreground">RIF</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground text-right">Comisión</TableHead>
              <TableHead className="text-muted-foreground text-center">Calificación</TableHead>
              <TableHead className="text-muted-foreground text-right">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCooperativas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No se encontraron cooperativas con los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              filteredCooperativas.map((coop) => (
                <TableRow 
                  key={coop.id}
                  onClick={() => router.push(`/admin/cooperativas/${coop.id}`)}
                  className="cursor-pointer transition-colors"
                >
                  <TableCell className="py-3">
                    <Avatar className="h-10 w-10 border">
                      <AvatarImage src={coop.logo_url || ""} alt={coop.nombre} />
                      <AvatarFallback className="bg-muted text-muted-foreground font-semibold">
                        {coop.nombre.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium text-foreground py-3">
                    <Link
                      href={`/admin/cooperativas/${coop.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-foreground underline decoration-primary underline-offset-4"
                    >
                      {coop.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm">{coop.rif}</span>
                      <RifIncompletoBadge rif={coop.rif} />
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <StatusBadge status={coop.estado} dominio="cooperativa" />
                  </TableCell>
                  <TableCell className="text-right text-foreground py-3 font-semibold">
                    {coop.comision_porcentaje} %
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-medium text-foreground">
                        {Number(coop.calificacion_promedio).toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({coop.total_calificaciones})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground py-3 text-sm">
                    {formatFechaVE(coop.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
