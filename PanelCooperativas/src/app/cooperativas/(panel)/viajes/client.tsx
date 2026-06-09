"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
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
import { Plus, DotsThree, Eye, MapTrifold, XCircle, CalendarBlank, Ticket, Package } from "@phosphor-icons/react";
import { guardarViaje, cancelarViaje, checkBoletosVendidos } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireOnline } from "@/components/connectivity-banner";
import { createClient } from "@/lib/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";

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
  const supabase = useMemo(() => createClient(), []);
  
  // States
  const [filterRuta, setFilterRuta] = useState<string>("all");
  const [filterFecha, setFilterFecha] = useState<string>("");
  const [filterEstado, setFilterEstado] = useState<string>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedViaje, setSelectedViaje] = useState<any | null>(null);
  
  const [isPending, startTransition] = useTransition();

  // Sub-listas de boletos y encomiendas en el detalle del viaje (Tarea 9)
  const [detallesLoading, setDetallesLoading] = useState(false);
  const [viajeBoletos, setViajeBoletos] = useState<any[]>([]);
  const [viajeEncomiendas, setViajeEncomiendas] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedViaje || !isSheetOpen) return;

    let isMounted = true;
    const loadDetalles = async () => {
      setDetallesLoading(true);
      // Reset sublists on load start to avoid synchronous setState inside effect body
      setViajeBoletos([]);
      setViajeEncomiendas([]);

      try {
        const [boletosRes, encomiendasRes] = await Promise.all([
          supabase
            .from("boletos")
            .select("id, codigo_boleto, asiento, estado, pasajero_nombre, pasajero_cedula")
            .eq("viaje_id", selectedViaje.id),
          supabase
            .from("encomiendas")
            .select("id, tracking_id, estado, receiver_nombre, receiver_telefono, descripcion_contenido, peso_kg")
            .eq("viaje_asignado_id", selectedViaje.id)
        ]);

        if (isMounted) {
          setViajeBoletos(boletosRes.data || []);
          setViajeEncomiendas(encomiendasRes.data || []);
        }
      } catch (err) {
        console.error("Error al cargar detalles del viaje:", err);
      } finally {
        if (isMounted) {
          setDetallesLoading(false);
        }
      }
    };

    void loadDetalles();

    return () => {
      isMounted = false;
    };
  }, [selectedViaje, isSheetOpen, supabase]);

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
      try {
        const check = await checkBoletosVendidos(viaje.id);
        if (check.error) {
          alert(check.error);
          return;
        }
        const count = check.count ?? 0;
        if (count > 0) {
          setAlertData({ id: viaje.id, count });
          setAlertOpen(true);
        } else {
          if (confirm("¿Seguro que deseas cancelar este viaje?")) {
            const res = await requireOnline(() => cancelarViaje(viaje.id))();
            if (res.error) alert(res.error);
          }
        }
      } catch (err: any) {
        alert(err.message || "Error inesperado");
      }
    });
  }

  async function forceCancelar() {
    if (!alertData) return;
    startTransition(async () => {
      try {
        const res = await requireOnline(() => cancelarViaje(alertData.id))();
        if (res.error) alert(res.error);
        setAlertOpen(false);
        setAlertData(null);
      } catch (err: any) {
        alert(err.message || "Error inesperado");
      }
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        payload[key] = value;
      }
    });

    startTransition(async () => {
      try {
        const res = await requireOnline(() => guardarViaje(
          payload, 
          isRecurring, 
          recurringDays, 
          payload.periodo_inicio, 
          payload.periodo_fin
        ))();
        if (res.error) {
          alert(res.error);
        } else {
          setIsModalOpen(false);
        }
      } catch (err: any) {
        alert(err.message || "Error inesperado");
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
          <Select value={filterRuta} onValueChange={(val) => setFilterRuta(val ?? "all")}>
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
          <Select value={filterEstado} onValueChange={(val) => setFilterEstado(val ?? "all")}>
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
                <Select name="ruta_id" value={rutaSeleccionada} onValueChange={(val) => setRutaSeleccionada(val ?? "")} required>
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
                    <ToggleGroup multiple value={recurringDays} onValueChange={setRecurringDays} className="justify-start">
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
        <SheetContent className="sm:max-w-2xl w-full flex flex-col h-full">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Detalles del Viaje</SheetTitle>
            <SheetDescription>
              {selectedViaje?.estado} — {selectedViaje && new Intl.DateTimeFormat("es-VE", { dateStyle: "long", timeStyle: "short" }).format(new Date(selectedViaje.fecha_hora_salida))}
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6 py-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block text-xs">Ruta</span>
                  <span className="font-semibold text-base">{formatCity(selectedViaje?.ruta?.ciudad_origen)} → {formatCity(selectedViaje?.ruta?.ciudad_destino)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Asientos</span>
                  <span className="font-semibold text-base">{selectedViaje?.asientos_disponibles} disponibles de {selectedViaje?.asientos_totales}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Chofer</span>
                  <span className="font-semibold text-base">{selectedViaje?.nombre_chofer || "No asignado"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Unidad</span>
                  <span className="font-semibold text-base">Unidad {selectedViaje?.numero_unidad || "No asignada"}</span>
                </div>
              </div>

              {/* Sección Boletos */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary" />
                  Boletos Vendidos ({viajeBoletos.length})
                </h3>
                {detallesLoading ? (
                  <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                ) : viajeBoletos.length === 0 ? (
                  <div className="bg-muted/30 border border-dashed p-6 rounded-md text-center text-sm text-muted-foreground">
                    No hay boletos vendidos para este viaje.
                  </div>
                ) : (
                  <div className="rounded-md border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Asiento</TableHead>
                          <TableHead>Pasajero</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viajeBoletos.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-bold text-center bg-muted/30">{b.asiento}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{b.pasajero_nombre || "Desconocido"}</span>
                                <span className="text-xs text-muted-foreground">{b.pasajero_cedula}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{b.codigo_boleto}</TableCell>
                            <TableCell><StatusBadge status={b.estado} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Sección Encomiendas */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Encomiendas Asignadas ({viajeEncomiendas.length})
                </h3>
                {detallesLoading ? (
                  <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                ) : viajeEncomiendas.length === 0 ? (
                  <div className="bg-muted/30 border border-dashed p-6 rounded-md text-center text-sm text-muted-foreground">
                    No hay encomiendas asignadas a este viaje.
                  </div>
                ) : (
                  <div className="rounded-md border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tracking ID</TableHead>
                          <TableHead>Destinatario</TableHead>
                          <TableHead>Peso</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viajeEncomiendas.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-xs font-semibold text-primary">{e.tracking_id}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium truncate max-w-[150px]">{e.receiver_nombre}</span>
                                <span className="text-xs text-muted-foreground">{e.receiver_telefono}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{e.peso_kg ? `${e.peso_kg} kg` : "N/A"}</TableCell>
                            <TableCell><StatusBadge status={e.estado} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
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
