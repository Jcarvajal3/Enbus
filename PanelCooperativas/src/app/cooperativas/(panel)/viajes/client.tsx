"use client";

import { useState, useEffect, useMemo, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, DotsThree, Eye, MapTrifold, XCircle, CalendarBlank, Ticket, Package, Bus, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { guardarViaje, cancelarViaje, checkBoletosVendidos, marcarSalidaViaje } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { requireOnline } from "@/components/connectivity-banner";
import { createClient } from "@/lib/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { Monto } from "@/components/monto";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { estadosDe, etiquetaEstado } from "@/lib/estados";
import { fechaVE, formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { formatCedula } from "@/lib/ve";
import { getEstadoUiBoleto, type SalidaViaje } from "@/lib/types/pagos";
import type { ImpactoCancelarViaje } from "@/lib/types/reembolsos";
import { formatCiudad } from "@/lib/ciudades";

export type ViajeParaSalida = { id: string; origen: string; destino: string; salida: string };

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "05/10 a las 8:00 a. m." (hora de Venezuela). */
function salidaLarga(iso: string) {
  return `${formatFechaVE(iso, { day: "2-digit", month: "2-digit" })} a las ${formatHoraVE(iso)}`;
}

const MOTIVOS_CANCELAR_VIAJE = ["Falla mecánica", "Vía cerrada o mal tiempo", "Pocos pasajeros", "Otro"];

/**
 * Confirmación de "Marcar salida" (también la usa Despacho). Cierra la venta de
 * boletos de esa salida y libera las reservas sin pagar (fn_marcar_salida_viaje).
 */
export function MarcarSalidaDialog({
  viaje,
  open,
  onOpenChange,
  onHecho,
}: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: (r: SalidaViaje) => void;
}) {
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (!viaje || enviando) return;
    setEnviando(true);
    try {
      const res = await requireOnline(() => marcarSalidaViaje(viaje.id))();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.data.ya_procesado) {
        toast.info("Este viaje ya estaba marcado como salido.");
      } else {
        const r = res.data.reservas_liberadas ?? 0;
        const p = res.data.pagos_en_verificacion ?? 0;
        const liberadas = plural(r, "Se liberó 1 reserva sin pagar.", "Se liberaron {n} reservas sin pagar.");
        const pendientes =
          p > 0 ? ` ${plural(p, "Queda 1 pago por verificar.", "Quedan {n} pagos por verificar.")}` : "";
        toast.success(`Salida registrada. ${liberadas}${pendientes}`);
      }
      onOpenChange(false);
      onHecho?.(res.data);
    } catch (err) {
      toast.error(humanizeError(err, "marcar la salida del viaje"));
    } finally {
      setEnviando(false);
    }
  };

  const hora = viaje ? formatFechaVE(viaje.salida, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";

  return (
    <AlertDialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿El bus de {formatCiudad(viaje?.origen)} → {formatCiudad(viaje?.destino)} {hora} ya salió?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se cerrará la venta de boletos de esta salida y se liberarán las reservas sin pagar. Los pagos en
            verificación seguirán pendientes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Todavía no</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? "Registrando…" : "Sí, ya salió"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ViajeACancelar = {
  id: string;
  ruta: string;
  salida: string;
  /** null = no se pudo calcular el impacto (el servidor igual lo aplica). */
  impacto: ImpactoCancelarViaje | null;
};

/** Lista "Qué va a pasar" al cancelar un viaje (#27). */
function lineasImpacto(impacto: ImpactoCancelarViaje | null) {
  if (!impacto) {
    return [
      "No pudimos contar los boletos de este viaje. Al cancelarlo se reembolsará el 100 % de los boletos pagados (los verás en Reembolsos) y se anularán las reservas sin pagar.",
      "Avisaremos a cada pasajero con tu motivo.",
    ];
  }
  const lineas: string[] = [];
  if (impacto.pagados > 0) {
    lineas.push(
      impacto.pagados === 1
        ? `1 boleto pagado: se reembolsará el 100 % (${formatUsd(impacto.total_usd)}). Lo verás en Reembolsos.`
        : `${impacto.pagados} boletos pagados: se reembolsará el 100 % (${formatUsd(impacto.total_usd)}). Los verás en Reembolsos.`
    );
  }
  if (impacto.reservas > 0) {
    lineas.push(plural(impacto.reservas, "1 reserva sin pagar se anulará.", "{n} reservas sin pagar se anularán."));
  }
  if (impacto.pagados > 0 || impacto.reservas > 0 || impacto.pagos_pendientes > 0) {
    lineas.push("Avisaremos a cada pasajero con tu motivo.");
  } else {
    lineas.push("Nadie compró boletos para este viaje: solo dejará de aparecer en la app y en la taquilla.");
  }
  if (impacto.encomiendas_en_transito > 0) {
    lineas.push(
      plural(
        impacto.encomiendas_en_transito,
        "1 encomienda ya despachada seguirá «En tránsito»: envíala en otro bus.",
        "{n} encomiendas ya despachadas seguirán «En tránsito»: envíalas en otro bus."
      )
    );
  }
  return lineas;
}

function AvisoPagosPendientes({ n }: { n: number | null }) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-100"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
      <p>
        {n && n > 0
          ? plural(n, "Hay 1 pago por verificar en este viaje. ", "Hay {n} pagos por verificar en este viaje. ")
          : "Hay pagos por verificar en este viaje. "}
        Apruébalos o recházalos antes de cancelarlo.{" "}
        <Link
          href="/cooperativas/pagos?tipo=boleto"
          className="font-medium text-foreground underline decoration-primary underline-offset-4"
        >
          Ir a Pagos por verificar
        </Link>
      </p>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ViajesClient({
  viajes,
  rutasActivas,
  userRole,
  errorCarga = null,
}: {
  viajes: any[];
  rutasActivas: any[];
  userRole: string;
  /** Error al cargar la lista (ya traducido). */
  errorCarga?: string | null;
}) {
  const isAdmin = userRole === "admin_cooperativa";
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // States
  const [filterRuta, setFilterRuta] = useState<string>("all");
  const [filterFecha, setFilterFecha] = useState<string>("");
  const [filterEstado, setFilterEstado] = useState<string>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedViaje, setSelectedViaje] = useState<any | null>(null);

  const [isPending, startTransition] = useTransition();

  // Sub-listas de boletos y encomiendas en el detalle del viaje
  const [detallesLoading, setDetallesLoading] = useState(false);
  const [detallesError, setDetallesError] = useState<string | null>(null);
  const [viajeBoletos, setViajeBoletos] = useState<any[]>([]);
  const [viajeEncomiendas, setViajeEncomiendas] = useState<any[]>([]);

  const cargarDetalles = useCallback(
    async (viajeId: string, estaMontado: () => boolean = () => true) => {
      setDetallesLoading(true);
      setDetallesError(null);
      setViajeBoletos([]);
      setViajeEncomiendas([]);
      try {
        const [boletosRes, encomiendasRes] = await Promise.all([
          supabase
            .from("boletos")
            .select("id, codigo_boleto, asiento, estado, pasajero_nombre, pasajero_cedula, pago:pagos!boletos_pago_id_fkey(estado_verificacion)")
            .eq("viaje_id", viajeId),
          supabase
            .from("encomiendas")
            .select("id, tracking_id, estado, receiver_nombre, receiver_telefono, descripcion_contenido, peso_kg")
            .eq("viaje_id", viajeId),
        ]);
        if (!estaMontado()) return;
        const error = boletosRes.error ?? encomiendasRes.error;
        if (error) {
          console.error("Error al cargar detalles del viaje:", error);
          setDetallesError(humanizeError(error, "cargar los boletos y encomiendas del viaje"));
          return;
        }
        setViajeBoletos(boletosRes.data || []);
        setViajeEncomiendas(encomiendasRes.data || []);
      } catch (err) {
        if (!estaMontado()) return;
        console.error("Error al cargar detalles del viaje:", err);
        setDetallesError(humanizeError(err, "cargar los boletos y encomiendas del viaje"));
      } finally {
        if (estaMontado()) setDetallesLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!selectedViaje || !isSheetOpen) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarDetalles(selectedViaje.id, () => isMounted);
    return () => {
      isMounted = false;
    };
  }, [selectedViaje, isSheetOpen, cargarDetalles]);

  // Form states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState<string>("");

  // "Cancelar viaje" (solo administrador). Se conserva el viaje al cerrar para la animación.
  const [viajeCancelar, setViajeCancelar] = useState<ViajeACancelar | null>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [revisandoId, setRevisandoId] = useState<string | null>(null);
  /** Pagos por verificar que bloquearon la cancelación (null = no hubo bloqueo). */
  const [bloqueoPendientes, setBloqueoPendientes] = useState<number | null>(null);

  // "Marcar salida" (taquillero y administrador)
  const [viajeSalida, setViajeSalida] = useState<ViajeParaSalida | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);

  function abrirMarcarSalida(viaje: any) {
    setSalidaOpen(true);
    setViajeSalida({
      id: viaje.id,
      origen: viaje.ruta?.ciudad_origen ?? "",
      destino: viaje.ruta?.ciudad_destino ?? "",
      salida: viaje.fecha_hora_salida,
    });
  }

  const opcionesRuta = rutasActivas.map((r) => ({
    value: r.id as string,
    label: `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`,
  }));

  // Filter Logic
  const filteredViajes = viajes.filter(v => {
    if (filterRuta !== "all" && v.ruta_id !== filterRuta) return false;
    if (filterEstado !== "all" && v.estado !== filterEstado) return false;
    if (filterFecha) {
      // Día de salida en hora de Venezuela (toISOString daría el día en UTC)
      const vDate = fechaVE(v.fecha_hora_salida);
      if (vDate !== filterFecha) return false;
    }
    return true;
  });

  function openCreateModal() {
    setIsRecurring(false);
    setRecurringDays([]);
    setRutaSeleccionada("");
    setFormError(null);
    setIsModalOpen(true);
  }

  function openDetalle(viaje: any) {
    setSelectedViaje(viaje);
    setIsSheetOpen(true);
  }

  /** Calcula el impacto y abre la confirmación. Si el cálculo falla, se abre igual con un texto genérico. */
  async function abrirCancelar(viaje: any) {
    if (revisandoId) return;
    setRevisandoId(viaje.id);
    let impacto: ImpactoCancelarViaje | null = null;
    try {
      const check = await checkBoletosVendidos(viaje.id);
      // Si no se pudo calcular, el diálogo lo dice y explica igual qué va a pasar (lineasImpacto(null)).
      impacto = check.impacto ?? null;
    } catch {
      impacto = null;
    } finally {
      setRevisandoId(null);
    }
    setBloqueoPendientes(impacto && impacto.pagos_pendientes > 0 ? impacto.pagos_pendientes : null);
    setViajeCancelar({
      id: viaje.id,
      ruta: `${formatCiudad(viaje.ruta?.ciudad_origen)} → ${formatCiudad(viaje.ruta?.ciudad_destino)}`,
      salida: viaje.fecha_hora_salida,
      impacto,
    });
    setCancelarOpen(true);
  }

  async function confirmarCancelar(motivo?: string) {
    if (!viajeCancelar) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    let res: Awaited<ReturnType<typeof cancelarViaje>>;
    try {
      res = await requireOnline(() => cancelarViaje(viajeCancelar.id, motivo ?? ""))();
    } catch (err) {
      return { ok: false, error: humanizeError(err, "cancelar el viaje") };
    }
    if (!res.success) {
      if (res.codigo === "EB_PAGOS_PENDIENTES") {
        setBloqueoPendientes(res.pendientes ?? (viajeCancelar.impacto?.pagos_pendientes || 0));
      }
      return { ok: false, error: res.error };
    }

    const r = res.data;
    if (r.ya_procesado) {
      toast.info("Este viaje ya estaba cancelado.");
    } else {
      const n = r.boletos_reembolso ?? 0;
      if (n > 0) {
        toast.success(
          `Viaje cancelado. ${plural(n, "1 reembolso pendiente.", "{n} reembolsos pendientes.")}`,
          { action: { label: "Ver reembolsos", onClick: () => router.push("/cooperativas/reembolsos") } }
        );
      } else if ((r.reservas_anuladas ?? 0) > 0) {
        toast.success("Viaje cancelado. Avisamos a los pasajeros que tenían reservas.");
      } else {
        toast.success("Viaje cancelado.");
      }
    }
    setIsSheetOpen(false);
    return { ok: true };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
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
          setFormError(res.error);
        } else {
          setIsModalOpen(false);
          toast.success(isRecurring ? "Viajes programados." : "Viaje programado.");
        }
      } catch (err) {
        setFormError(humanizeError(err, "programar el viaje"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Viajes" description="Programa las salidas de tus rutas y sigue cada viaje.">
        {isAdmin && (
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" weight="bold" />
            Programar viaje
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-4 bg-muted/50 p-4 rounded-lg border">
        <div className="flex-1 space-y-1">
          <Label htmlFor="filtro-ruta">Ruta</Label>
          <Select value={filterRuta} onValueChange={(val) => setFilterRuta(val ?? "all")} items={[{ value: "all", label: "Todas las rutas" }, ...opcionesRuta]}>
            <SelectTrigger id="filtro-ruta"><SelectValue placeholder="Todas las rutas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {rutasActivas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {formatCiudad(r.ciudad_origen)} → {formatCiudad(r.ciudad_destino)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="filtro-fecha">Fecha</Label>
          <Input id="filtro-fecha" type="date" value={filterFecha} onChange={(e) => setFilterFecha(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="filtro-estado">Estado</Label>
          <Select value={filterEstado} onValueChange={(val) => setFilterEstado(val ?? "all")} items={[{ value: "all", label: "Todos los estados" }, ...estadosDe("viaje").map((e) => ({ value: e, label: etiquetaEstado("viaje", e) }))]}>
            <SelectTrigger id="filtro-estado"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {estadosDe("viaje").map((estado) => (
                <SelectItem key={estado} value={estado}>{etiquetaEstado("viaje", estado)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(filterRuta !== "all" || filterFecha || filterEstado !== "all") && (
          <div className="flex items-end">
            <Button variant="ghost" onClick={() => {
              setFilterRuta("all");
              setFilterFecha("");
              setFilterEstado("all");
            }}>Limpiar filtros</Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        {errorCarga && viajes.length === 0 ? (
          <ErrorState
            titulo="No pudimos cargar los viajes"
            descripcion={errorCarga}
            onReintentar={() => router.refresh()}
          />
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ruta</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead>Llegada estimada</TableHead>
              <TableHead>Asientos libres</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredViajes.map((viaje) => (
              <TableRow key={viaje.id} className={viaje.estado === "CANCELADO" ? "text-muted-foreground" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <MapTrifold className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span>{formatCiudad(viaje.ruta?.ciudad_origen)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{formatCiudad(viaje.ruta?.ciudad_destino)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {formatFechaVE(viaje.fecha_hora_salida, { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell>
                  {formatFechaVE(viaje.fecha_hora_llegada_est, { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{viaje.asientos_disponibles}</span> / <span className="text-muted-foreground">{viaje.asientos_totales}</span>
                </TableCell>
                <TableCell>
                  {Number(viaje.ruta?.precio_pasaje) > 0 ? (
                    <Monto usd={Number(viaje.ruta.precio_pasaje)} size="sm" />
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin precio</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={viaje.estado} dominio="viaje" />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {viaje.estado === "PROGRAMADO" && (
                    <Button variant="outline" size="sm" className="mr-1" onClick={() => abrirMarcarSalida(viaje)}>
                      <Bus className="h-4 w-4" aria-hidden />
                      Marcar salida
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={revisandoId === viaje.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span className="sr-only">
                        Más acciones del viaje {formatCiudad(viaje.ruta?.ciudad_origen)} → {formatCiudad(viaje.ruta?.ciudad_destino)}
                      </span>
                      {revisandoId === viaje.id ? <Spinner size="sm" /> : <DotsThree className="h-4 w-4" weight="bold" aria-hidden />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openDetalle(viaje)}>
                        <Eye className="mr-2 h-4 w-4" aria-hidden />
                        Ver detalles
                      </DropdownMenuItem>
                      {isAdmin && viaje.estado === "PROGRAMADO" && (
                        <DropdownMenuItem
                          onClick={() => void abrirCancelar(viaje)}
                          className="text-destructive-text focus:text-destructive-text"
                        >
                          <XCircle className="mr-2 h-4 w-4" aria-hidden />
                          Cancelar viaje
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}

            {filteredViajes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground p-0">
                  <EmptyState
                    icon={CalendarBlank}
                    title={viajes.length === 0 ? "Aún no hay viajes" : "Sin resultados"}
                    description={
                      viajes.length === 0
                        ? isAdmin
                          ? "Programa tu primera salida con «Programar viaje» para empezar a vender boletos."
                          : "Cuando el administrador programe salidas, aparecerán aquí."
                        : "No hay viajes que coincidan con los filtros."
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={(abierto) => !isPending && setIsModalOpen(abierto)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Programar viaje</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 py-4">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
                >
                  <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                  <p>{formError}</p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="viaje-ruta">Ruta</Label>
                <Select name="ruta_id" value={rutaSeleccionada} onValueChange={(val) => setRutaSeleccionada(val ?? "")} items={opcionesRuta} required>
                  <SelectTrigger id="viaje-ruta"><SelectValue placeholder="Elige una ruta activa" /></SelectTrigger>
                  <SelectContent>
                    {rutasActivas.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatCiudad(r.ciudad_origen)} → {formatCiudad(r.ciudad_destino)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rutasActivas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No tienes rutas activas.{" "}
                    <Link href="/cooperativas/rutas" className="font-medium text-foreground underline decoration-primary underline-offset-4">
                      Crea una ruta
                    </Link>{" "}
                    antes de programar viajes.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="viaje-recurrente" className="text-base">Viaje recurrente</Label>
                  <p className="text-sm text-muted-foreground">Crea una salida por cada día elegido dentro de un periodo.</p>
                </div>
                <Switch id="viaje-recurrente" checked={isRecurring} onCheckedChange={setIsRecurring} />
              </div>

              {isRecurring ? (
                <div className="grid gap-4 border p-4 rounded-lg bg-muted/20">
                  <div className="grid gap-2">
                    <Label>Días de salida</Label>
                    <ToggleGroup multiple value={recurringDays} onValueChange={setRecurringDays} className="justify-start" aria-label="Días de salida">
                      {["L", "M", "Mi", "J", "V", "S", "D"].map(d => (
                        <ToggleGroupItem key={d} value={d} className="w-10 h-10 rounded-full border">{d}</ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="viaje-hora">Hora de salida</Label>
                    <Input id="viaje-hora" type="time" name="hora_fija" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viaje-desde">Desde</Label>
                      <Input id="viaje-desde" type="date" name="periodo_inicio" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="viaje-hasta">Hasta</Label>
                      <Input id="viaje-hasta" type="date" name="periodo_fin" required />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="viaje-salida">Fecha y hora de salida</Label>
                  <Input id="viaje-salida" type="datetime-local" name="fecha_hora_salida" required />
                  <p className="text-xs text-muted-foreground">Hora de Venezuela. La llegada estimada se calcula con la duración de la ruta.</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="viaje-asientos">Asientos</Label>
                  <Input id="viaje-asientos" type="number" name="asientos_totales" min={1} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="viaje-unidad">Unidad (opcional)</Label>
                  <Input id="viaje-unidad" type="text" name="numero_unidad" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="viaje-chofer">Chofer (opcional)</Label>
                  <Input id="viaje-chofer" type="text" name="nombre_chofer" />
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner size="sm" />}
                {isPending ? "Programando…" : isRecurring ? "Programar viajes" : "Programar viaje"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-2xl w-full flex flex-col h-full">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Detalle del viaje</SheetTitle>
            <SheetDescription>
              {selectedViaje ? etiquetaEstado("viaje", selectedViaje.estado) : ""} — {selectedViaje && formatFechaVE(selectedViaje.fecha_hora_salida, { dateStyle: "long", timeStyle: "short" })}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6 py-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block text-xs">Ruta</span>
                  <span className="font-semibold text-base">{formatCiudad(selectedViaje?.ruta?.ciudad_origen)} → {formatCiudad(selectedViaje?.ruta?.ciudad_destino)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Asientos</span>
                  <span className="font-semibold text-base">{selectedViaje?.asientos_disponibles} libres de {selectedViaje?.asientos_totales}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Chofer</span>
                  <span className="font-semibold text-base">{selectedViaje?.nombre_chofer || "Sin asignar"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Unidad</span>
                  <span className="font-semibold text-base">{selectedViaje?.numero_unidad ? `Unidad ${selectedViaje.numero_unidad}` : "Sin asignar"}</span>
                </div>
              </div>

              {detallesError && !detallesLoading ? (
                <ErrorState
                  compacto
                  titulo="No pudimos cargar los boletos y encomiendas"
                  descripcion={detallesError}
                  onReintentar={() => (selectedViaje ? cargarDetalles(selectedViaje.id) : undefined)}
                />
              ) : (
                <>
                  {/* Sección Boletos */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-primary-text" aria-hidden />
                      Boletos ({viajeBoletos.length})
                    </h3>
                    {detallesLoading ? (
                      <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                    ) : viajeBoletos.length === 0 ? (
                      <div className="bg-muted/30 border border-dashed p-6 rounded-md text-center text-sm text-muted-foreground">
                        Este viaje no tiene boletos vendidos ni reservas.
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
                                    <span className="font-medium">{b.pasajero_nombre || "Sin nombre"}</span>
                                    <span className="text-xs text-muted-foreground">{b.pasajero_cedula ? formatCedula(b.pasajero_cedula) : "Sin cédula"}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{b.codigo_boleto}</TableCell>
                                <TableCell><StatusBadge status={getEstadoUiBoleto(b.estado, b.pago?.estado_verificacion)} dominio="boleto" /></TableCell>
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
                      <Package className="w-5 h-5 text-primary-text" aria-hidden />
                      Encomiendas ({viajeEncomiendas.length})
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
                              <TableHead>Código de seguimiento</TableHead>
                              <TableHead>Destinatario</TableHead>
                              <TableHead>Peso</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {viajeEncomiendas.map((e) => (
                              <TableRow key={e.id}>
                                <TableCell className="font-mono text-xs font-semibold">{e.tracking_id}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium truncate max-w-[150px]">{e.receiver_nombre}</span>
                                    <span className="text-xs text-muted-foreground">{e.receiver_telefono}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs">{e.peso_kg ? `${String(e.peso_kg).replace(".", ",")} kg` : "Sin pesar"}</TableCell>
                                <TableCell><StatusBadge status={e.estado} dominio="encomienda" /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {isAdmin && selectedViaje?.estado === "PROGRAMADO" && (
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="text-destructive-text"
                    disabled={revisandoId === selectedViaje.id}
                    onClick={() => void abrirCancelar(selectedViaje)}
                  >
                    {revisandoId === selectedViaje.id ? <Spinner size="sm" /> : <XCircle className="h-4 w-4" aria-hidden />}
                    Cancelar viaje
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={cancelarOpen && viajeCancelar !== null}
        onOpenChange={(abierto) => {
          setCancelarOpen(abierto);
          if (!abierto) setBloqueoPendientes(null);
        }}
        tono="destructive"
        titulo={viajeCancelar ? `¿Cancelar el viaje ${viajeCancelar.ruta} del ${salidaLarga(viajeCancelar.salida)}?` : "¿Cancelar el viaje?"}
        descripcion={
          bloqueoPendientes !== null ? <AvisoPagosPendientes n={bloqueoPendientes} /> : undefined
        }
        impacto={lineasImpacto(viajeCancelar?.impacto ?? null)}
        motivo={{
          etiqueta: "Motivo de la cancelación (lo verán los pasajeros)",
          placeholder: "Ej.: Falla mecánica de la unidad",
          minimo: 5,
          chips: MOTIVOS_CANCELAR_VIAJE,
        }}
        verbo="Cancelar viaje y avisar a los pasajeros"
        verboCargando="Cancelando…"
        textoCancelar="Volver"
        onConfirm={confirmarCancelar}
      />

      <MarcarSalidaDialog
        viaje={viajeSalida}
        open={salidaOpen && viajeSalida !== null}
        onOpenChange={setSalidaOpen}
      />
    </div>
  );
}
