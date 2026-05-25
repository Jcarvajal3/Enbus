"use client";

import { useState, useTransition } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, DotsThree, PencilSimple, MapTrifold } from "@phosphor-icons/react";
import { ESTADOS_VENEZUELA, CIUDADES_POR_ESTADO } from "@/lib/data/venezuela";
import { guardarRuta, toggleActivaRuta, checkDesactivarRuta } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function RutasClient({
  rutas,
  userRole,
}: {
  rutas: any[];
  userRole: string;
}) {
  const isAdmin = userRole === "admin_cooperativa";
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuta, setEditingRuta] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activaSwitch, setActivaSwitch] = useState(true);

  // Alert Dialog state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertData, setAlertData] = useState<{ id: string, count: number } | null>(null);

  // Form states
  const [estadoOrigen, setEstadoOrigen] = useState<string>("");
  const [ciudadOrigen, setCiudadOrigen] = useState<string>("");
  const [estadoDestino, setEstadoDestino] = useState<string>("");
  const [ciudadDestino, setCiudadDestino] = useState<string>("");

  function openCreateModal() {
    setEditingRuta(null);
    setEstadoOrigen("");
    setCiudadOrigen("");
    setEstadoDestino("");
    setCiudadDestino("");
    setActivaSwitch(true);
    setIsModalOpen(true);
  }

  function openEditModal(ruta: any) {
    setEditingRuta(ruta);
    setEstadoOrigen(ruta.estado_origen);
    setCiudadOrigen(ruta.ciudad_origen);
    setEstadoDestino(ruta.estado_destino);
    setCiudadDestino(ruta.ciudad_destino);
    setActivaSwitch(ruta.activa);
    setIsModalOpen(true);
  }

  async function handleToggleRuta(ruta: any) {
    if (ruta.activa) {
      // Intento de desactivar
      startTransition(async () => {
        const check = await checkDesactivarRuta(ruta.id);
        if (check.error) {
          alert(check.error);
          return;
        }
        if (check.hasViajes) {
          setAlertData({ id: ruta.id, count: check.count });
          setAlertOpen(true);
        } else {
          // desactivar seguro
          const res = await toggleActivaRuta(ruta.id, false);
          if (res.error) alert(res.error);
        }
      });
    } else {
      // reactivar
      startTransition(async () => {
        const res = await toggleActivaRuta(ruta.id, true);
        if (res.error) alert(res.error);
      });
    }
  }

  async function forceDesactivar() {
    if (!alertData) return;
    startTransition(async () => {
      const res = await toggleActivaRuta(alertData.id, false);
      if (res.error) alert(res.error);
      setAlertOpen(false);
      setAlertData(null);
    });
  }

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      // Inject activa from controlled state since shadcn Switch with checked= won't add to FormData
      formData.set("activa", activaSwitch ? "on" : "off");
      const res = await guardarRuta(formData, editingRuta?.id);
      if (res.error) {
        alert(res.error);
      } else {
        setIsModalOpen(false);
      }
    });
  }

  function formatCity(val: string | undefined) {
    if (!val) return "";
    return val.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rutas" description="Gestiona los destinos operativos">
        {isAdmin && (
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" weight="bold" />
            Crear Ruta
          </Button>
        )}
      </PageHeader>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origen → Destino</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Precio Pasaje</TableHead>
              <TableHead>Estado</TableHead>
              {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rutas.map((ruta) => (
              <TableRow key={ruta.id} className={!ruta.activa ? "opacity-60" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <MapTrifold className="h-4 w-4 text-muted-foreground" />
                    <span>{formatCity(ruta.ciudad_origen)}, {formatCity(ruta.estado_origen)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{formatCity(ruta.ciudad_destino)}, {formatCity(ruta.estado_destino)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {ruta.duracion_estimada_min > 60 
                    ? `${Math.floor(ruta.duracion_estimada_min / 60)}h ${ruta.duracion_estimada_min % 60}m`
                    : `${ruta.duracion_estimada_min} min`}
                </TableCell>
                <TableCell>
                  {formatCurrency(ruta.precio_pasaje)}
                </TableCell>
                <TableCell>
                  {ruta.activa ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Activa</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/20">Inactiva</Badge>
                  )}
                </TableCell>
                
                {isAdmin && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                        <span className="sr-only">Abrir menú</span>
                        <DotsThree className="h-4 w-4" weight="bold" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(ruta)}>
                          <PencilSimple className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleToggleRuta(ruta)}
                          className={ruta.activa ? "text-destructive focus:text-destructive" : ""}
                        >
                          {ruta.activa ? "Desactivar" : "Reactivar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
            
            {rutas.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="h-48 text-center text-muted-foreground p-0">
                  <EmptyState 
                    icon={MapTrifold} 
                    title="Sin rutas" 
                    description="No has creado ninguna ruta operativa aún." 
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
            <DialogTitle>{editingRuta ? "Editar Ruta" : "Crear Nueva Ruta"}</DialogTitle>
          </DialogHeader>
          
          <form action={handleSubmit}>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Estado Origen</Label>
                  <Select name="estado_origen" value={estadoOrigen} onValueChange={(val) => { setEstadoOrigen(val ?? ""); setCiudadOrigen(""); }} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VENEZUELA.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Ciudad Origen</Label>
                  <Select name="ciudad_origen" value={ciudadOrigen} onValueChange={(val) => setCiudadOrigen(val ?? "")} disabled={!estadoOrigen} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {estadoOrigen && CIUDADES_POR_ESTADO[estadoOrigen]?.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Estado Destino</Label>
                  <Select name="estado_destino" value={estadoDestino} onValueChange={(val) => { setEstadoDestino(val ?? ""); setCiudadDestino(""); }} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VENEZUELA.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Ciudad Destino</Label>
                  <Select name="ciudad_destino" value={ciudadDestino} onValueChange={(val) => setCiudadDestino(val ?? "")} disabled={!estadoDestino} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {estadoDestino && CIUDADES_POR_ESTADO[estadoDestino]?.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Duración (min)</Label>
                  <Input type="number" name="duracion_estimada_min" defaultValue={editingRuta?.duracion_estimada_min || ""} min={1} required />
                </div>
                <div className="grid gap-2">
                  <Label>Precio Pasaje ($)</Label>
                  <Input type="number" step="0.01" name="precio_pasaje" defaultValue={editingRuta?.precio_pasaje || ""} min={0.1} required />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Ruta Activa</Label>
                  <p className="text-sm text-muted-foreground">Las rutas activas pueden ser programadas para viajes.</p>
                </div>
                <Switch
                  name="activa"
                  checked={activaSwitch}
                  onCheckedChange={setActivaSwitch}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar Ruta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¡Atención!</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ruta tiene <strong>{alertData?.count} viajes futuros programados</strong>. ¿Estás seguro de que deseas desactivarla de todos modos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={forceDesactivar} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isPending ? "Desactivando..." : "Sí, desactivar ruta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
