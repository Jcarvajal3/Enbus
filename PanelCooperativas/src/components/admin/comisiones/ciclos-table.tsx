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
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Warning, ArrowsCounterClockwise, Receipt, Coins } from "@phosphor-icons/react";
import { ComisionCiclo } from "@/lib/types/admin-comisiones";
import { ExportCSVButton } from "./export-csv-button";
import { marcarCicloComoPagado } from "@/app/admin/(panel)/comisiones/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface CiclosTableProps {
  data: ComisionCiclo[];
  cooperativas: { id: string; nombre: string }[];
}

export function CiclosTable({ data, cooperativas }: CiclosTableProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

  const handleMarkAsPaid = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await marcarCicloComoPagado(id);
      if (!res.success) {
        toast.error(res.error || "No se pudo marcar el ciclo como pagado");
      } else {
        toast.success("Ciclo de comisión liquidado exitosamente");
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar la solicitud");
    } finally {
      setLoadingId(null);
    }
  };

  const handleResetFilters = () => {
    setCooperativaFilter("all");
    setEstadoFilter("all");
    setDesdeFilter("");
    setHastaFilter("");
    toast.info("Filtros restablecidos");
  };

  // Totales de la selección filtrada
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, curr) => {
        acc.encomiendas += curr.total_encomiendas;
        acc.boletos += curr.total_boletos;
        acc.comisiones += curr.monto_comision;
        if (!curr.pagado) acc.pendiente += curr.monto_comision;
        return acc;
      },
      { encomiendas: 0, boletos: 0, comisiones: 0, pendiente: 0 }
    );
  }, [filteredData]);

  return (
    <div className="space-y-6">
      {/* Tarjetas de Resumen Rápido (Basadas en los filtros) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border p-4 rounded-xl flex flex-col justify-between">
          <span className="text-muted-foreground text-xs font-medium">Ventas Encomiendas</span>
          <span className="text-xl font-semibold text-foreground mt-2">${totals.encomiendas.toFixed(2)}</span>
        </div>
        <div className="bg-card border p-4 rounded-xl flex flex-col justify-between">
          <span className="text-muted-foreground text-xs font-medium">Ventas Boletos</span>
          <span className="text-xl font-semibold text-foreground mt-2">${totals.boletos.toFixed(2)}</span>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" /> Total Comisiones
          </span>
          <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 mt-2">${totals.comisiones.toFixed(2)}</span>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-1">
            <Warning className="h-3.5 w-3.5" /> Pendiente por Cobrar
          </span>
          <span className="text-xl font-semibold text-amber-600 dark:text-amber-400 mt-2">${totals.pendiente.toFixed(2)}</span>
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
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">Todas las cooperativas</option>
                {cooperativas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estado_filter" className="text-xs text-muted-foreground">Estado Pago</Label>
              <select
                id="estado_filter"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hasta_filter" className="text-xs text-muted-foreground">Hasta</Label>
              <input
                id="hasta_filter"
                type="date"
                value={hastaFilter}
                onChange={(e) => setHastaFilter(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                <ArrowsCounterClockwise className="h-3.5 w-3.5" /> Limpiar
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
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Boletos</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Encomiendas</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Comisión %</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-right">Monto Comisión</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-center">Estado</TableHead>
              <TableHead className="text-muted-foreground font-medium p-4 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Receipt className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No se encontraron ciclos de comisiones</p>
                    <p className="text-xs text-muted-foreground">Prueba cambiando los criterios de búsqueda o genera un nuevo ciclo.</p>
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
                      <span>{item.periodo_inicio}</span>
                      <span className="text-muted-foreground/60">—</span>
                      <span>{item.periodo_fin}</span>
                    </div>
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    ${item.total_boletos.toFixed(2)}
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    ${item.total_encomiendas.toFixed(2)}
                  </TableCell>
                  <TableCell className="p-4 text-right text-muted-foreground text-xs">
                    {item.comision_porcentaje}%
                  </TableCell>
                  <TableCell className="p-4 text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    ${item.monto_comision.toFixed(2)}
                  </TableCell>
                  <TableCell className="p-4 text-center">
                    {item.pagado ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-2 py-0.5">
                        Pagado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 px-2 py-0.5 animate-pulse">
                        Pendiente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="p-4 text-center">
                    {item.pagado ? (
                      <div className="text-[10px] text-muted-foreground flex flex-col items-center">
                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
                          <Check className="h-3 w-3" /> Liquidado
                        </span>
                        <span>{item.pagado_at ? new Date(item.pagado_at).toLocaleDateString("es-ES") : ""}</span>
                      </div>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="secondary"
                            size="sm"
                            disabled={loadingId === item.id}
                            className="text-xs h-8 px-3"
                          >
                            Liquidar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Marcar ciclo como solvente?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground text-sm">
                              Esta acción registrará que la cooperativa <strong>{item.cooperativa_nombre}</strong> ha cancelado la comisión de <strong>${item.monto_comision.toFixed(2)}</strong> del período <strong>{item.periodo_inicio} al {item.periodo_fin}</strong>. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleMarkAsPaid(item.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium animate-none"
                            >
                              Confirmar Liquidación
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
