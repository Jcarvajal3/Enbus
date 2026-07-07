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
import { Input } from "@/components/ui/input";
import { 
  Warning, 
  Check, 
  Clock, 
  Hourglass, 
  ArrowsCounterClockwise, 
  MagnifyingGlass 
} from "@phosphor-icons/react";
import { Incidencia } from "@/lib/types/admin-incidencias";
import { useRouter } from "next/navigation";

interface IncidenciasTableProps {
  data: Incidencia[];
}

export function IncidenciasTable({ data }: IncidenciasTableProps) {
  const router = useRouter();

  // Filters State
  const [tipoFilter, setTipoFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Filter logic
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // 1. Tipo
      if (tipoFilter !== "all" && item.tipo !== tipoFilter) {
        return false;
      }
      // 2. Estado
      if (estadoFilter !== "all" && item.estado !== estadoFilter) {
        return false;
      }
      // 3. Search (Description or Tracking ID)
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const matchesDesc = item.descripcion.toLowerCase().includes(query);
        const matchesTracking = item.encomienda?.tracking_id?.toLowerCase().includes(query) || false;
        if (!matchesDesc && !matchesTracking) return false;
      }
      return true;
    });
  }, [data, tipoFilter, estadoFilter, searchTerm]);

  // Extract unique types for dropdown
  const uniqueTypes = useMemo(() => {
    const types = new Set(data.map((item) => item.tipo));
    return Array.from(types);
  }, [data]);

  const handleResetFilters = () => {
    setTipoFilter("all");
    setEstadoFilter("all");
    setSearchTerm("");
  };

  // Get status badge properties
  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "ABIERTA":
        return {
          variant: "destructive" as const,
          className: "bg-red-500/15 text-red-500 hover:bg-red-500/25 border-red-500/20",
          icon: <Warning className="h-3 w-3 inline mr-1" />
        };
      case "EN_PROCESO":
        return {
          variant: "secondary" as const,
          className: "bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border-amber-500/20",
          icon: <Hourglass className="h-3 w-3 inline mr-1" />
        };
      case "RESUELTA":
        return {
          variant: "default" as const,
          className: "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20",
          icon: <Check className="h-3 w-3 inline mr-1" />
        };
      default:
        return {
          variant: "outline" as const,
          className: "",
          icon: <Clock className="h-3 w-3 inline mr-1" />
        };
    }
  };

  // Get type badge properties
  const getTypeBadge = (tipo: string) => {
    switch (tipo) {
      case "PERDIDA":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
      case "DANADA":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20";
      case "DEMORA":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20";
      case "ALERTA_AMARILLA":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20";
      case "REPORTE_USUARIO":
        return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20";
      default:
        return "bg-muted text-muted-foreground border";
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "PERDIDA": return "Pérdida";
      case "DANADA": return "Dañada";
      case "DEMORA": return "Demora";
      case "ALERTA_AMARILLA": return "Alerta Amarilla";
      case "REPORTE_USUARIO": return "Reporte de Usuario";
      default: return tipo;
    }
  };

  return (
    <div className="space-y-6">
      {/* Controles de Filtros */}
      <div className="bg-card border rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:flex-1">
            
            {/* Búsqueda */}
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Input
                  id="search"
                  type="text"
                  placeholder="Descripción o Tracking ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background border-input text-foreground focus-visible:ring-emerald-500"
                />
                <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Filtro de Estado */}
            <div className="space-y-1.5">
              <Label htmlFor="estado" className="text-xs text-muted-foreground">Estado</Label>
              <select
                id="estado"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className="w-full h-9 bg-background border border-input rounded-md px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">Todos los estados</option>
                <option value="ABIERTA">Abierta</option>
                <option value="EN_PROCESO">En Proceso</option>
                <option value="RESUELTA">Resuelta</option>
              </select>
            </div>

            {/* Filtro de Tipo */}
            <div className="space-y-1.5">
              <Label htmlFor="tipo" className="text-xs text-muted-foreground">Tipo de Incidencia</Label>
              <select
                id="tipo"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
                className="w-full h-9 bg-background border border-input rounded-md px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">Todos los tipos</option>
                {uniqueTypes.map((t) => (
                  <option key={t} value={t}>{getTipoLabel(t)}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Botón Restablecer */}
          <div className="flex gap-2 w-full md:w-auto">
            {(tipoFilter !== "all" || estadoFilter !== "all" || searchTerm !== "") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs h-9 border bg-background text-muted-foreground hover:text-foreground gap-1 w-full md:w-auto"
              >
                <ArrowsCounterClockwise className="h-3.5 w-3.5" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Contenedor de la Tabla */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] text-muted-foreground font-medium py-3">ID</TableHead>
                <TableHead className="text-muted-foreground font-medium py-3">Tipo</TableHead>
                <TableHead className="text-muted-foreground font-medium py-3">Encomienda</TableHead>
                <TableHead className="text-muted-foreground font-medium py-3">Reportado Por</TableHead>
                <TableHead className="text-muted-foreground font-medium py-3">Estado</TableHead>
                <TableHead className="text-muted-foreground font-medium py-3">Fecha Reporte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                    No se encontraron incidencias que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => {
                  const statusProps = getStatusBadge(item.estado);
                  return (
                    <TableRow
                      key={item.id}
                      onClick={() => router.push(`/admin/incidencias/${item.id}`)}
                      className="cursor-pointer transition-colors"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground py-3.5">
                        #{item.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${getTypeBadge(item.tipo)}`}>
                          {getTipoLabel(item.tipo)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        {item.encomienda ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {item.encomienda.tracking_id}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {item.encomienda.descripcion_contenido}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-foreground py-3.5">
                        {item.reportado_por_profile?.nombre_completo || "Sistema"}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <Badge
                          variant={statusProps.variant}
                          className={`text-[10px] py-0 px-1.5 h-5 font-normal border ${statusProps.className}`}
                        >
                          {statusProps.icon}
                          {item.estado === "ABIERTA" ? "Abierta" : item.estado === "EN_PROCESO" ? "En Proceso" : "Resuelta"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3.5">
                        {new Date(item.created_at).toLocaleString("es-VE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
