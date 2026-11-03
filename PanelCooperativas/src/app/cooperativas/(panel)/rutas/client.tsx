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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, DotsThree, PencilSimple, MapTrifold } from "@phosphor-icons/react";
import { ESTADOS_VENEZUELA, CIUDADES_POR_ESTADO } from "@/lib/data/venezuela";
import { guardarRuta, toggleActivaRuta, checkDesactivarRuta } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireOnline } from "@/components/connectivity-banner";
import { Monto } from "@/components/monto";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errores";

/** Por encima de este precio (USD) se pide confirmar que no se escribió en bolívares. */
const PRECIO_ALTO_USD = 500;

/** "15,50" | "15.50" | "1.250,00" -> número (NaN si no es válido). */
function leerPrecio(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    limpio.lastIndexOf(",") > limpio.lastIndexOf(".") ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

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

  // Desactivar una ruta con viajes programados (con confirmación)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertData, setAlertData] = useState<{ id: string; count: number; nombre: string } | null>(null);

  // Form states
  const [estadoOrigen, setEstadoOrigen] = useState<string>("");
  const [ciudadOrigen, setCiudadOrigen] = useState<string>("");
  const [estadoDestino, setEstadoDestino] = useState<string>("");
  const [ciudadDestino, setCiudadDestino] = useState<string>("");
  // Precio en USD (texto controlado para mostrar el equivalente en Bs mientras se escribe)
  const [precioTexto, setPrecioTexto] = useState<string>("");
  // Formulario en espera de confirmar un precio muy alto (¿escrito en Bs?)
  const [precioAltoPendiente, setPrecioAltoPendiente] = useState<FormData | null>(null);

  const tasa = useTasaBCV();
  const precioUsd = leerPrecio(precioTexto);
  const precioValido = Number.isFinite(precioUsd) && precioUsd > 0;
  const precioAltoUsd = precioAltoPendiente ? leerPrecio(String(precioAltoPendiente.get("precio_pasaje") ?? "")) : NaN;

  function openCreateModal() {
    setEditingRuta(null);
    setEstadoOrigen("");
    setCiudadOrigen("");
    setEstadoDestino("");
    setCiudadDestino("");
    setPrecioTexto("");
    setActivaSwitch(true);
    setIsModalOpen(true);
  }

  function openEditModal(ruta: any) {
    setEditingRuta(ruta);
    setEstadoOrigen(ruta.estado_origen);
    setCiudadOrigen(ruta.ciudad_origen);
    setEstadoDestino(ruta.estado_destino);
    setCiudadDestino(ruta.ciudad_destino);
    setPrecioTexto(ruta.precio_pasaje != null ? String(ruta.precio_pasaje) : "");
    setActivaSwitch(ruta.activa);
    setIsModalOpen(true);
  }

  async function handleToggleRuta(ruta: any) {
    if (ruta.activa) {
      // Intento de desactivar
      startTransition(async () => {
        try {
          const check = await checkDesactivarRuta(ruta.id);
          if (check.error) {
            toast.error(check.error);
            return;
          }
          if (check.hasViajes) {
            setAlertData({
              id: ruta.id,
              count: check.count,
              nombre: `${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)}`,
            });
            setAlertOpen(true);
          } else {
            // desactivar seguro
            const res = await requireOnline(() => toggleActivaRuta(ruta.id, false))();
            if (res.error) toast.error(res.error);
            else toast.success(`Ruta ${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)} desactivada.`);
          }
        } catch (err: any) {
          toast.error(humanizeError(err, "desactivar la ruta"));
        }
      });
    } else {
      // reactivar
      startTransition(async () => {
        try {
          const res = await requireOnline(() => toggleActivaRuta(ruta.id, true))();
          if (res.error) toast.error(res.error);
        } catch (err: any) {
          toast.error(humanizeError(err, "reactivar la ruta"));
        }
      });
    }
  }

  async function forceDesactivar() {
    if (!alertData) return { ok: false, error: "No encontramos la ruta. Actualiza la página." };
    try {
      const res = await requireOnline(() => toggleActivaRuta(alertData.id, false))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err: any) {
      return { ok: false, error: humanizeError(err, "desactivar la ruta") };
    }
    toast.success(`Ruta ${alertData.nombre} desactivada.`);
    return { ok: true };
  }

  function guardar(formData: FormData) {
    startTransition(async () => {
      try {
        // Inject activa from controlled state since shadcn Switch with checked= won't add to FormData
        formData.set("activa", activaSwitch ? "on" : "off");
        const res = await requireOnline(() => guardarRuta(formData, editingRuta?.id))();
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(editingRuta ? "Ruta actualizada." : "Ruta creada.");
          setIsModalOpen(false);
        }
      } catch (err: any) {
        toast.error(humanizeError(err, "guardar la ruta"));
      }
    });
  }

  function handleSubmit(formData: FormData) {
    const precio = leerPrecio(String(formData.get("precio_pasaje") ?? ""));
    // Un precio muy alto suele ser un monto en bolívares escrito por error: pedir confirmación.
    if (Number.isFinite(precio) && precio > PRECIO_ALTO_USD) {
      setPrecioAltoPendiente(formData);
      return;
    }
    guardar(formData);
  }

  function confirmarPrecioAlto() {
    const formData = precioAltoPendiente;
    setPrecioAltoPendiente(null);
    if (formData) guardar(formData);
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
              <TableHead>Precio del pasaje</TableHead>
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
                  <Monto usd={Number(ruta.precio_pasaje)} size="sm" />
                </TableCell>
                <TableCell>
                  {ruta.activa ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">Activa</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-200">Inactiva</Badge>
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
                    title="Aún no tienes rutas" 
                    description={isAdmin ? "Crea tu primera ruta con su precio en USD para poder programar viajes." : "Cuando el administrador cree rutas, aparecerán aquí."} 
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
          
          {/* onSubmit (no `action`): React no reinicia el formulario si hay error o se pide confirmar el precio. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }}
          >
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
                  <Label htmlFor="precio_pasaje">Precio del pasaje (USD)</Label>
                  <Input
                    id="precio_pasaje"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name="precio_pasaje"
                    placeholder="Ej: 15,00"
                    value={precioTexto}
                    onChange={(e) => setPrecioTexto(e.target.value)}
                    aria-describedby="precio_pasaje_ayuda"
                    required
                  />
                </div>
                <p id="precio_pasaje_ayuda" className="col-span-2 -mt-2 text-xs text-muted-foreground">
                  Es el precio de referencia. El pasajero paga en bolívares a la tasa BCV del día
                  {tasa && precioValido
                    ? ` (hoy ≈ ${formatBs(usdABs(precioUsd, tasa.tasa))}).`
                    : tasa
                      ? "."
                      : " (hoy no hay tasa BCV registrada)."}
                </p>
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

      <ConfirmDialog
        open={alertOpen && alertData !== null}
        onOpenChange={setAlertOpen}
        tono="destructive"
        titulo={alertData ? `¿Desactivar la ruta ${alertData.nombre}?` : "¿Desactivar la ruta?"}
        impacto={
          alertData
            ? [
                alertData.count === 1
                  ? "Tiene 1 viaje programado: seguirá en pie. Cancélalo en Viajes si no va a salir."
                  : `Tiene ${alertData.count} viajes programados: seguirán en pie. Cancélalos en Viajes si no van a salir.`,
                "No podrás programar viajes nuevos en esta ruta hasta reactivarla.",
              ]
            : []
        }
        verbo="Desactivar ruta"
        verboCargando="Desactivando…"
        onConfirm={forceDesactivar}
      />

      <AlertDialog
        open={precioAltoPendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPrecioAltoPendiente(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que el precio está en dólares?</AlertDialogTitle>
            <AlertDialogDescription>
              Escribiste <strong>{Number.isFinite(precioAltoUsd) ? formatUsd(precioAltoUsd) : ""}</strong> como precio del
              pasaje.
              {tasa && Number.isFinite(precioAltoUsd)
                ? ` A la tasa BCV de hoy, el pasajero pagaría ${formatBs(usdABs(precioAltoUsd, tasa.tasa))}.`
                : ""}{" "}
              Si ese monto está en bolívares, conviértelo a dólares antes de guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Corregir precio</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarPrecioAlto}>Sí, está en dólares</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
