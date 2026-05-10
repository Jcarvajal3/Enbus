"use client";

import { useState, useTransition } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, DotsThree, Eye, MapTrifold, XCircle, CalendarBlank } from "@phosphor-icons/react";
import { guardarViaje, cancelarViaje, checkBoletosVendidos } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ViajesClient({
  viajes,
  rutasActivas,
  userRole,
}: {
  viajes: any[];
  rutasActivas: any[];
  userRole: string;
}) {
  const isAdmin = userRole === "admin_cooperativa";
  
  // States
  const [filterRuta, setFilterRuta] = useState<string>("all");
  const [filterFecha, setFilterFecha] = useState<string>("");
  const [filterEstado, setFilterEstado] = useState<string>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedViaje, setSelectedViaje] = useState<any | null>(null);
  
  const [isPending, startTransition] = useTransition();

  // Form states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState<string>("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertData, setAlertData] = useState<{ id: string, count: number } | null>(null);

  // Filter Logic
  const filteredViajes = viajes.filter(v => {
    if (filterRuta !== "all" && v.ruta_id !== filterRuta) return false;
    if (filterEstado !== "all" && v.estado !== filterEstado) return false;
    if (filterFecha) {
      const vDate = new Date(v.fecha_hora_salida).toISOString().split("T")[0];
      if (vDate !== filterFecha) return false;
    }
    return true;
  });

  function openCreateModal() {
    setIsRecurring(false);
    setRecurringDays([]);
    setRutaSeleccionada("");
    setIsModalOpen(true);
  }

  function openDetalle(viaje: any) {
    setSelectedViaje(viaje);
    setIsSheetOpen(true);
  }

  async function handleCancelar(viaje: any) {
    startTransition(async () => {
      const check = await checkBoletosVendidos(viaje.id);
      if (check.error) {
        alert(check.error);
        return;
      }
      if (check.count > 0) {
        setAlertData({ id: viaje.id, count: check.count });
        setAlertOpen(true);
      } else {
        if (confirm("¿Seguro que deseas cancelar este viaje?")) {
          const res = await cancelarViaje(viaje.id);
          if (res.error) alert(res.error);
        }
      }
    });
  }

  async function forceCancelar() {
    if (!alertData) return;
    startTransition(async () => {
      const res = await cancelarViaje(alertData.id);
      if (res.error) alert(res.error);
      setAlertOpen(false);
      setAlertData(null);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    startTransition(async () => {
      const res = await guardarViaje(
        payload, 
        isRecurring, 
        recurringDays, 
        payload.periodo_inicio as string, 
        payload.periodo_fin as string
      );
      if (res.error) {
        alert(res.error);
      } else {
        setIsModalOpen(false);
      }
    });
  }

  function formatCity(val: string) {
    if (!val) return "";
    return val.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Viajes" description="Planificación y seguimiento de viajes">
        {isAdmin && (
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" weight="bold" />
            Programar Viaje
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-4 bg-muted/50 p-4 rounded-lg border">
        <div className="flex-1 space-y-1">
          <Label>Filtrar por Ruta</Label>
          <Select value={filterRuta} onValueChange={setFilterRuta}>
            <SelectTrigger><SelectValue placeholder="Todas las rutas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {rutasActivas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {formatCity(r.ciudad_origen)} → {formatCity(r.ciudad_destino)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={filterFecha} onChange={(e) => setFilterFecha(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <Label>Estado</Label>
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="PROGRAMADO">Programado</SelectItem>
              <SelectItem value="EN_CURSO">En Curso</SelectItem>
              <SelectItem value="COMPLETADO">Completado</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(filterRuta !== "all" || filterFecha || filterEstado !== "all") && (
          <div className="flex items-end">
            <Button variant="ghost" onClick={() => {
              setFilterRuta("all");
              setFilterFecha("");
              setFilterEstado("all");
            }}>Limpiar</Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ruta</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead>Llegada Est.</TableHead>
              <TableHead>Asientos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredViajes.map((viaje) => (
              <TableRow key={viaje.id} className={viaje.estado === "CANCELADO" ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <MapTrifold className="h-4 w-4 text-muted-foreground" />
                    <span>{formatCity(viaje.ruta?.ciudad_origen)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{formatCity(viaje.ruta?.ciudad_destino)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short" }).format(new Date(viaje.fecha_hora_salida))}
                </TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short" }).format(new Date(viaje.fecha_hora_llegada_est))}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{viaje.asientos_disponibles}</span> / <span className="text-muted-foreground">{viaje.asientos_totales}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={viaje.estado === "PROGRAMADO" ? "default" : viaje.estado === "EN_CURSO" ? "secondary" : viaje.estado === "CANCELADO" ? "destructive" : "outline"}>
                    {viaje.estado}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                      <span className="sr-only">Abrir menú</span>
                      <DotsThree className="h-4 w-4" weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openDetalle(viaje)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver Detalles
                      </DropdownMenuItem>
                      {isAdmin && viaje.estado === "PROGRAMADO" && (
                        <DropdownMenuItem 
                          onClick={() => handleCancelar(viaje)}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancelar Viaje
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            
            {filteredViajes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground p-0">
                  <EmptyState 
                    icon={CalendarBlank} 
                    title="Sin viajes" 
                    description="No hay viajes programados que coincidan con los filtros." 
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Programar Viaje</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 py-4">
              <div className="grid gap-2">
                <Label>Ruta</Label>
                <Select name="ruta_id" value={rutaSeleccionada} onValueChange={setRutaSeleccionada} required>
                  <SelectTrigger><SelectValue placeholder="Seleccionar ruta activa" /></SelectTrigger>
                  <SelectContent>
                    {rutasActivas.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatCity(r.ciudad_origen)} → {formatCity(r.ciudad_destino)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Viaje Recurrente</Label>
                  <p className="text-sm text-muted-foreground">Genera múltiples viajes en un periodo.</p>
                </div>
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
              </div>

              {isRecurring ? (
                <div className="grid gap-4 border p-4 rounded-lg bg-muted/20">
                  <div className="grid gap-2">
                    <Label>Días de salida</Label>
                    <ToggleGroup type="multiple" value={recurringDays} onValueChange={setRecurringDays} className="justify-start">
                      {["L", "M", "Mi", "J", "V", "S", "D"].map(d => (
                        <ToggleGroupItem key={d} value={d} className="w-10 h-10 rounded-full border">{d}</ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="grid gap-2">
                    <Label>Hora de salida fija</Label>
                    <Input type="time" name="hora_fija" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Desde</Label>
                      <Input type="date" name="periodo_inicio" required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Hasta</Label>
                      <Input type="date" name="periodo_fin" required />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Fecha y Hora de Salida</Label>
                  <Input type="datetime-local" name="fecha_hora_salida" required />
                  <p className="text-xs text-muted-foreground">La llegada estimada se calcula automáticamente.</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Asientos</Label>
                  <Input type="number" name="asientos_totales" min={1} required />
                </div>
                <div className="grid gap-2">
                  <Label>Número de Unidad (Opcional)</Label>
                  <Input type="text" name="numero_unidad" />
                </div>
                <div className="grid gap-2">
                  <Label>Chofer (Opcional)</Label>
                  <Input type="text" name="nombre_chofer" />
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Procesando..." : "Programar Viaje(s)"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Detalles del Viaje</SheetTitle>
            <SheetDescription>
              {selectedViaje?.estado} — {selectedViaje && new Intl.DateTimeFormat("es-VE", { dateStyle: "long", timeStyle: "short" }).format(new Date(selectedViaje.fecha_hora_salida))}
            </SheetDescription>
          </SheetHeader>
          <div className="py-6 grid gap-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">Ruta</span>
                <span className="font-medium">{formatCity(selectedViaje?.ruta?.ciudad_origen)} → {formatCity(selectedViaje?.ruta?.ciudad_destino)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Asientos</span>
                <span className="font-medium">{selectedViaje?.asientos_disponibles} disponibles de {selectedViaje?.asientos_totales}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Chofer</span>
                <span className="font-medium">{selectedViaje?.nombre_chofer || "No asignado"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Unidad</span>
                <span className="font-medium">{selectedViaje?.numero_unidad || "No asignada"}</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Boletos Vendidos</h3>
              <div className="bg-muted p-4 rounded-md text-center text-sm text-muted-foreground">
                Módulo en construcción o pendiente de carga...
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Encomiendas Asignadas</h3>
              <div className="bg-muted p-4 rounded-md text-center text-sm text-muted-foreground">
                Módulo en construcción o pendiente de carga...
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelación de Viaje con Boletos</AlertDialogTitle>
            <AlertDialogDescription>
              Este viaje tiene <strong>{alertData?.count} boletos reservados o pagados</strong>. Al cancelar, el sistema marcará los boletos como cancelados pero deberás gestionar el reembolso o reprogramación manualmente. ¿Confirmas la cancelación?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={forceCancelar} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isPending ? "Procesando..." : "Sí, Cancelar Viaje"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
