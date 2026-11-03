"use client";

import { useState, useEffect, useMemo, useRef, useTransition, useCallback, useId, type FormEvent, type ReactNode, type TransitionStartFunction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, DotsThree, Eye, MapTrifold, XCircle, CalendarBlank, Ticket, Package, Bus, WarningCircle, PencilSimple, FlagCheckered, Printer, Info } from "@phosphor-icons/react";
import { toast } from "sonner";
import { guardarViaje, cancelarViaje, checkBoletosVendidos, marcarSalidaViaje, editarViaje, completarViaje } from "./actions";
import { DIAS_SEMANA, planificarSalidas, resumenSalidas, textoBotonSalidas } from "./salidas";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CeldaEnlace } from "@/components/celda-enlace";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { createClient } from "@/lib/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { Monto } from "@/components/monto";
import { useUser } from "@/hooks/use-user";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { estadosDe, etiquetaEstado } from "@/lib/estados";
import { fechaVE, formatFechaCalendario, formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { imprimirManifiesto, MSG_VENTANA_BLOQUEADA } from "@/lib/printing/manifiesto";
import { getEstadoUiBoleto, type SalidaViaje } from "@/lib/types/pagos";
import type { ImpactoCancelarViaje } from "@/lib/types/reembolsos";
import { formatCiudad } from "@/lib/ciudades";
import { cn } from "@/lib/utils";

export type ViajeParaSalida = { id: string; origen: string; destino: string; salida: string };

export type VistaViajes = "hoy" | "proximos" | "historial";

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "05/10 a las 8:00 a. m." (hora de Venezuela). */
function salidaLarga(iso: string) {
  return `${formatFechaVE(iso, { day: "2-digit", month: "2-digit" })} a las ${formatHoraVE(iso)}`;
}

/** ISO → 'YYYY-MM-DDTHH:mm' en hora de Venezuela (para un input datetime-local). */
function isoALocalVE(iso: string) {
  return `${fechaVE(iso)}T${formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
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
      className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
      <p>
        {n && n > 0
          ? plural(n, "Hay 1 pago por verificar en este viaje. ", "Hay {n} pagos por verificar en este viaje. ")
          : "Hay pagos por verificar en este viaje. "}
        Apruébalos o recházalos antes de cancelarlo.{" "}
        <Link href="/cooperativas/pagos?tipo=boleto" className="font-medium underline underline-offset-4">
          Ir a Pagos por verificar
        </Link>
      </p>
    </div>
  );
}

function MensajeError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

// ─── Programar viaje (#52, PC-44) ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function ProgramarViajeDialog({
  open,
  onOpenChange,
  rutasActivas,
}: {
  open: boolean;
  onOpenChange(abierto: boolean): void;
  rutasActivas: any[];
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(abierto) => !isPending && onOpenChange(abierto)}>
      {open && (
        <FormularioProgramar
          rutasActivas={rutasActivas}
          isPending={isPending}
          startTransition={startTransition}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

/** Se monta al abrir: el formulario empieza limpio cada vez. */
function FormularioProgramar({
  rutasActivas,
  isPending,
  startTransition,
  onCerrar,
}: {
  rutasActivas: any[];
  isPending: boolean;
  startTransition: TransitionStartFunction;
  onCerrar(): void;
}) {
  const uid = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [rutaSeleccionada, setRutaSeleccionada] = useState<string>("");
  // Recurrente (controlado para el resumen en vivo)
  const [dias, setDias] = useState<string[]>([]);
  const [hora, setHora] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [intentado, setIntentado] = useState(false);
  // Único
  const [salida, setSalida] = useState("");
  const [asientos, setAsientos] = useState("");
  const [unidad, setUnidad] = useState("");
  const [chofer, setChofer] = useState("");

  const plan = useMemo(() => planificarSalidas({ dias, desde, hasta, hora }), [dias, desde, hasta, hora]);
  const mostrarPlan = intentado || Boolean(desde && hasta && hora);

  const opcionesRuta = rutasActivas.map((r) => ({
    value: r.id as string,
    label: `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`,
  }));

  const alternarDia = (valor: string) =>
    setDias((prev) => (prev.includes(valor) ? prev.filter((d) => d !== valor) : [...prev, valor]));

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setIntentado(true);
    if (!rutaSeleccionada) {
      setFormError("Elige la ruta del viaje.");
      return;
    }
    if (isRecurring && !plan.ok) {
      document.getElementById(`${uid}-${plan.campo}`)?.focus();
      return;
    }
    const payload: Record<string, string> = {
      ruta_id: rutaSeleccionada,
      asientos_totales: asientos,
      numero_unidad: unidad.trim(),
      nombre_chofer: chofer.trim(),
      hora_fija: hora,
      fecha_hora_salida: salida,
    };

    startTransition(async () => {
      try {
        const res = await requireOnline(() => guardarViaje(payload, isRecurring, dias, desde, hasta))();
        if (res.error) {
          setFormError(res.error);
        } else {
          onCerrar();
          toast.success(
            isRecurring && plan.ok
              ? plural(plan.salidas.length, "Programamos 1 salida.", "Programamos {n} salidas.")
              : "Viaje programado."
          );
        }
      } catch (err) {
        setFormError(humanizeError(err, "programar el viaje"));
      }
    });
  }

  const errorPlan = isRecurring && mostrarPlan && !plan.ok ? plan : null;

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Programar viaje</DialogTitle>
        <DialogDescription>Hora de Venezuela. La llegada estimada se calcula con la duración de la ruta.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 py-4">
          {formError && <MensajeError>{formError}</MensajeError>}

          <div className="grid gap-2">
            <Label htmlFor={`${uid}-ruta`}>Ruta</Label>
            <Select value={rutaSeleccionada} onValueChange={(val) => setRutaSeleccionada(val ?? "")} items={opcionesRuta}>
              <SelectTrigger id={`${uid}-ruta`}><SelectValue placeholder="Elige una ruta activa" /></SelectTrigger>
              <SelectContent>
                {rutasActivas.map((r) => (
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

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${uid}-recurrente`} className="text-base">Viaje recurrente</Label>
              <p className="text-sm text-muted-foreground">Crea una salida por cada día elegido dentro de un periodo.</p>
            </div>
            <Switch id={`${uid}-recurrente`} checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring ? (
            <div className="grid gap-4 rounded-lg border bg-muted/20 p-4">
              <div className="grid gap-2">
                <p id={`${uid}-dias-label`} className="text-sm font-medium">Días de salida</p>
                <div
                  id={`${uid}-dias`}
                  tabIndex={-1}
                  role="group"
                  aria-labelledby={`${uid}-dias-label`}
                  className="flex flex-wrap gap-2 outline-none"
                >
                  {DIAS_SEMANA.map((d) => {
                    const activo = dias.includes(d.valor);
                    return (
                      <Button
                        key={d.valor}
                        type="button"
                        size="sm"
                        variant={activo ? "default" : "outline"}
                        aria-pressed={activo}
                        aria-label={d.nombre}
                        onClick={() => alternarDia(d.valor)}
                        className="min-w-12"
                      >
                        {d.corto}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-hora`}>Hora de salida</Label>
                <Input id={`${uid}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`${uid}-desde`}>Desde</Label>
                  <Input id={`${uid}-desde`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${uid}-hasta`}>Hasta</Label>
                  <Input
                    id={`${uid}-hasta`}
                    type="date"
                    value={hasta}
                    min={desde || undefined}
                    onChange={(e) => setHasta(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div aria-live="polite">
                {errorPlan ? (
                  <MensajeError>{errorPlan.error}</MensajeError>
                ) : plan.ok ? (
                  <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
                    <Info className="mt-0.5 size-4 shrink-0 text-info-text" weight="fill" aria-hidden />
                    {resumenSalidas(plan)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-salida`}>Fecha y hora de salida</Label>
              <Input id={`${uid}-salida`} type="datetime-local" value={salida} onChange={(e) => setSalida(e.target.value)} required />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-asientos`}>Asientos</Label>
              <Input
                id={`${uid}-asientos`}
                type="number"
                inputMode="numeric"
                min={1}
                max={80}
                value={asientos}
                onChange={(e) => setAsientos(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-unidad`}>Unidad (opcional)</Label>
              <Input id={`${uid}-unidad`} type="text" maxLength={40} value={unidad} onChange={(e) => setUnidad(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-chofer`}>Chofer (opcional)</Label>
              <Input id={`${uid}-chofer`} type="text" maxLength={80} value={chofer} onChange={(e) => setChofer(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
            {isPending && <Spinner size="sm" />}
            {isPending ? "Programando…" : isRecurring ? textoBotonSalidas(plan) : "Programar salida"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Editar viaje (#52, P-48) ────────────────────────────────────────────────

function EditarViajeDialog({
  viaje,
  open,
  onOpenChange,
}: {
  viaje: any | null;
  open: boolean;
  onOpenChange(abierto: boolean): void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      {open && viaje && (
        <FormularioEditar
          key={viaje.id}
          viaje={viaje}
          enviando={enviando}
          setEnviando={setEnviando}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

type CampoEditar = "salida" | "asientos" | "motivo";

function FormularioEditar({
  viaje,
  enviando,
  setEnviando,
  onCerrar,
}: {
  viaje: any;
  enviando: boolean;
  setEnviando(v: boolean): void;
  onCerrar(): void;
}) {
  const uid = useId();
  const supabase = useMemo(() => createClient(), []);
  const enviandoRef = useRef(false);
  const salidaInicial = isoALocalVE(viaje.fecha_hora_salida);
  const [salida, setSalida] = useState(salidaInicial);
  const [unidad, setUnidad] = useState<string>(viaje.numero_unidad ?? "");
  const [chofer, setChofer] = useState<string>(viaje.nombre_chofer ?? "");
  const [asientos, setAsientos] = useState<string>(String(viaje.asientos_totales ?? ""));
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Partial<Record<CampoEditar, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [minimoAsientos, setMinimoAsientos] = useState<number | null>(null);
  /** Compradores a los que se avisará si cambia la hora (null = cargando o no se pudo contar). */
  const [pasajeros, setPasajeros] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data, error } = await supabase
        .from("boletos")
        .select("comprador_id")
        .eq("viaje_id", viaje.id)
        .in("estado", ["RESERVADO", "PAGADO"]);
      if (!vivo || error) return;
      setPasajeros(new Set((data ?? []).map((b: { comprador_id: string | null }) => b.comprador_id ?? "")).size);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, viaje.id]);

  const cambiaHora = salida !== salidaInicial;
  // Si no se pudo contar, se pide el motivo por si acaso (el servidor también lo exige).
  const pideMotivo = cambiaHora && pasajeros !== 0;

  const limpiar = (campo: CampoEditar) =>
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const sig = { ...prev };
      delete sig[campo];
      return sig;
    });

  const enfocar = (campo: CampoEditar) => window.setTimeout(() => document.getElementById(`${uid}-${campo}`)?.focus(), 0);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || enviandoRef.current) return;
    setErrorGeneral(null);

    const encontrados: Partial<Record<CampoEditar, string>> = {};
    const nAsientos = Number(asientos);
    if (!salida) encontrados.salida = "Elige la fecha y la hora de salida.";
    if (!Number.isInteger(nAsientos) || nAsientos < 1 || nAsientos > 80) {
      encontrados.asientos = "El bus debe tener entre 1 y 80 asientos.";
    } else if (minimoAsientos && nAsientos < minimoAsientos) {
      encontrados.asientos = `Ya hay pasajeros hasta el asiento ${minimoAsientos}: el bus debe tener al menos ${minimoAsientos} asientos.`;
    }
    if (pideMotivo && motivo.trim().length < 5) {
      encontrados.motivo = "Explica por qué cambia la hora (mínimo 5 caracteres). Les enviaremos tu mensaje.";
    }
    setErrores(encontrados);
    const primero = (["salida", "asientos", "motivo"] as CampoEditar[]).find((c) => encontrados[c]);
    if (primero) {
      enfocar(primero);
      return;
    }

    const cambios = {
      salida: cambiaHora ? salida : undefined,
      numeroUnidad: unidad.trim() !== (viaje.numero_unidad ?? "") ? unidad : undefined,
      nombreChofer: chofer.trim() !== (viaje.nombre_chofer ?? "") ? chofer : undefined,
      asientosTotales: nAsientos !== Number(viaje.asientos_totales) ? nAsientos : undefined,
    };
    if (Object.values(cambios).every((v) => v === undefined)) {
      toast.info("No hay cambios que guardar.");
      onCerrar();
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const res = await requireOnline(() =>
        editarViaje({ viajeId: viaje.id, ...cambios, motivo: cambiaHora ? motivo : undefined })
      )();
      if (!res.success) {
        const campo = res.campo as CampoEditar | undefined;
        if (res.minimo) setMinimoAsientos(res.minimo);
        if (campo === "salida" || campo === "asientos" || campo === "motivo") {
          setErrores({ [campo]: res.error });
          enfocar(campo);
        } else {
          setErrorGeneral(res.error);
        }
        return;
      }
      const n = res.data.pasajeros_avisados ?? 0;
      toast.success(
        n > 0 ? `Viaje actualizado. ${plural(n, "Avisamos a 1 pasajero.", "Avisamos a {n} pasajeros.")}` : "Viaje actualizado."
      );
      setEnviando(false);
      onCerrar();
    } catch (err) {
      setErrorGeneral(humanizeError(err, "editar el viaje"));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const ayuda = (campo: CampoEditar) => (errores[campo] ? `${uid}-${campo}-error` : undefined);
  const ruta = `${formatCiudad(viaje.ruta?.ciudad_origen)} → ${formatCiudad(viaje.ruta?.ciudad_destino)}`;

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!enviando}>
      <form onSubmit={enviar} noValidate className="grid gap-5">
        <DialogHeader>
          <DialogTitle>Editar viaje</DialogTitle>
          <DialogDescription>
            {ruta} · {salidaLarga(viaje.fecha_hora_salida)}
          </DialogDescription>
        </DialogHeader>

        {errorGeneral && <MensajeError>{errorGeneral}</MensajeError>}

        <div className="grid gap-2">
          <Label htmlFor={`${uid}-salida`}>Fecha y hora de salida</Label>
          <Input
            id={`${uid}-salida`}
            type="datetime-local"
            value={salida}
            disabled={enviando}
            aria-invalid={errores.salida ? true : undefined}
            aria-describedby={ayuda("salida") ?? `${uid}-salida-ayuda`}
            onChange={(e) => {
              setSalida(e.target.value);
              limpiar("salida");
            }}
          />
          {errores.salida ? (
            <p id={`${uid}-salida-error`} className="text-sm text-destructive-text">{errores.salida}</p>
          ) : (
            <p id={`${uid}-salida-ayuda`} className="text-xs text-muted-foreground">
              Hora de Venezuela. La llegada estimada se recalcula con la duración de la ruta.
            </p>
          )}
        </div>

        {cambiaHora && (
          <div className="grid gap-3 rounded-xl border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
            <p className="flex items-start gap-2" role="status">
              <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
              {pasajeros === null
                ? "Si hay pasajeros, les avisaremos del cambio de hora."
                : pasajeros === 0
                  ? "Este viaje no tiene pasajeros: no hace falta avisar a nadie."
                  : plural(pasajeros, "Avisaremos a 1 pasajero del cambio de hora.", "Avisaremos a {n} pasajeros del cambio de hora.")}
            </p>
            {pideMotivo && (
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-motivo`} className="text-warning-deep">Motivo del cambio (se lo enviaremos)</Label>
                <Textarea
                  id={`${uid}-motivo`}
                  value={motivo}
                  rows={2}
                  maxLength={300}
                  disabled={enviando}
                  placeholder="Ej.: Cambio de unidad por mantenimiento."
                  className="bg-background text-foreground"
                  aria-invalid={errores.motivo ? true : undefined}
                  aria-describedby={ayuda("motivo")}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    limpiar("motivo");
                  }}
                />
                {errores.motivo && (
                  <p id={`${uid}-motivo-error`} className="font-medium">{errores.motivo}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${uid}-unidad`}>Unidad</Label>
            <Input id={`${uid}-unidad`} value={unidad} maxLength={40} disabled={enviando} onChange={(e) => setUnidad(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${uid}-chofer`}>Chofer</Label>
            <Input id={`${uid}-chofer`} value={chofer} maxLength={80} disabled={enviando} onChange={(e) => setChofer(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${uid}-asientos`}>Asientos</Label>
          <Input
            id={`${uid}-asientos`}
            type="number"
            inputMode="numeric"
            min={minimoAsientos ?? 1}
            max={80}
            value={asientos}
            disabled={enviando}
            aria-invalid={errores.asientos ? true : undefined}
            aria-describedby={ayuda("asientos") ?? `${uid}-asientos-ayuda`}
            onChange={(e) => {
              setAsientos(e.target.value);
              limpiar("asientos");
            }}
          />
          {errores.asientos ? (
            <p id={`${uid}-asientos-error`} className="text-sm text-destructive-text">{errores.asientos}</p>
          ) : (
            <p id={`${uid}-asientos-ayuda`} className="text-xs text-muted-foreground">
              {minimoAsientos
                ? `Mínimo ${minimoAsientos}: ya hay pasajeros hasta ese asiento.`
                : "No puede ser menor que el asiento más alto ya vendido."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <Spinner size="sm" />}
            {enviando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Lista ───────────────────────────────────────────────────────────────────

const VISTAS: { valor: VistaViajes; etiqueta: (totalHoy: number | null) => string }[] = [
  { valor: "hoy", etiqueta: (n) => (n === null ? "Hoy" : `Hoy (${n})`) },
  { valor: "proximos", etiqueta: () => "Próximos 7 días" },
  { valor: "historial", etiqueta: () => "Historial" },
];

export function ViajesClient({
  viajes,
  rutasActivas,
  userRole,
  vista = "hoy",
  fecha = null,
  totalHoy = null,
  historialRecortado = false,
  errorCarga = null,
}: {
  viajes: any[];
  rutasActivas: any[];
  userRole: string;
  vista?: VistaViajes;
  /** Día elegido en el filtro ('YYYY-MM-DD'): reemplaza a la pestaña. */
  fecha?: string | null;
  /** Salidas de hoy (más las que están en curso), para "Hoy ({n})". */
  totalHoy?: number | null;
  /** El historial llegó al límite de 100. */
  historialRecortado?: boolean;
  /** Error al cargar la lista (ya traducido). */
  errorCarga?: string | null;
}) {
  const isAdmin = userRole === "admin_cooperativa";
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const tasa = useTasaBCV();

  // Filtros del cliente (la pestaña y el día van en la URL)
  const [filterRuta, setFilterRuta] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  // Tras editar, la lista llega de nuevo del servidor: el detalle muestra la fila al día.
  const selectedViaje = useMemo(
    () => viajes.find((v) => v.id === selectedId) ?? selectedSnapshot,
    [viajes, selectedId, selectedSnapshot]
  );

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
            .select("id, tracking_id, estado, receiver_nombre, receiver_telefono, descripcion_contenido, peso_kg, modalidad_pago, costo_calculado")
            .eq("viaje_id", viajeId),
        ]);
        if (!estaMontado()) return;
        const error = boletosRes.error ?? encomiendasRes.error;
        if (error) {
          setDetallesError(humanizeError(error, "cargar los boletos y encomiendas del viaje"));
          return;
        }
        const boletos = [...(boletosRes.data || [])].sort((a, b) =>
          String(a.asiento ?? "").localeCompare(String(b.asiento ?? ""), "es", { numeric: true })
        );
        setViajeBoletos(boletos);
        setViajeEncomiendas(encomiendasRes.data || []);
      } catch (err) {
        if (!estaMontado()) return;
        setDetallesError(humanizeError(err, "cargar los boletos y encomiendas del viaje"));
      } finally {
        if (estaMontado()) setDetallesLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!selectedId || !isSheetOpen) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarDetalles(selectedId, () => isMounted);
    return () => {
      isMounted = false;
    };
  }, [selectedId, isSheetOpen, cargarDetalles]);

  // "Cancelar viaje" (solo administrador). Se conserva el viaje al cerrar para la animación.
  const [viajeCancelar, setViajeCancelar] = useState<ViajeACancelar | null>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [revisandoId, setRevisandoId] = useState<string | null>(null);
  /** Pagos por verificar que bloquean la cancelación: se muestra solo el aviso con el enlace. */
  const [bloqueo, setBloqueo] = useState<{ ruta: string; salida: string; pendientes: number | null } | null>(null);

  // "Marcar salida" (taquillero y administrador)
  const [viajeSalida, setViajeSalida] = useState<ViajeParaSalida | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);

  // "Marcar llegada" (EN_CURSO, ambos roles)
  const [viajeLlegada, setViajeLlegada] = useState<any | null>(null);
  const [llegadaOpen, setLlegadaOpen] = useState(false);

  // "Editar viaje" (admin, PROGRAMADO)
  const [viajeEditar, setViajeEditar] = useState<any | null>(null);
  const [editarOpen, setEditarOpen] = useState(false);

  const rutaDe = (viaje: any) => `${formatCiudad(viaje?.ruta?.ciudad_origen)} → ${formatCiudad(viaje?.ruta?.ciudad_destino)}`;

  function abrirMarcarSalida(viaje: any) {
    setSalidaOpen(true);
    setViajeSalida({
      id: viaje.id,
      origen: viaje.ruta?.ciudad_origen ?? "",
      destino: viaje.ruta?.ciudad_destino ?? "",
      salida: viaje.fecha_hora_salida,
    });
  }

  function abrirLlegada(viaje: any) {
    setViajeLlegada(viaje);
    setLlegadaOpen(true);
  }

  function abrirEditar(viaje: any) {
    setViajeEditar(viaje);
    setEditarOpen(true);
  }

  async function confirmarLlegada() {
    if (!viajeLlegada) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    let res: Awaited<ReturnType<typeof completarViaje>>;
    try {
      res = await requireOnline(() => completarViaje(viajeLlegada.id))();
    } catch (err) {
      return { ok: false, error: humanizeError(err, "marcar la llegada del viaje") };
    }
    if (!res.success) return { ok: false, error: res.error };
    if (res.data.ya_procesado) {
      toast.info("Este viaje ya estaba completado.");
    } else {
      const n = res.data.no_embarcados ?? 0;
      toast.success(
        n > 0
          ? `Viaje completado. ${plural(n, "1 pasajero no embarcó.", "{n} pasajeros no embarcaron.")}`
          : "Viaje completado."
      );
    }
    return { ok: true };
  }

  const opcionesRuta = rutasActivas.map((r) => ({
    value: r.id as string,
    label: `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`,
  }));

  const filteredViajes = viajes.filter((v) => {
    if (filterRuta !== "all" && v.ruta_id !== filterRuta) return false;
    if (filterEstado !== "all" && v.estado !== filterEstado) return false;
    return true;
  });

  /** Navega a la misma página con otra pestaña o día (sin recargar todo). */
  function irA(params: { vista?: VistaViajes; fecha?: string | null }) {
    const sp = new URLSearchParams();
    if (params.fecha) sp.set("fecha", params.fecha);
    else if (params.vista && params.vista !== "hoy") sp.set("vista", params.vista);
    const qs = sp.toString();
    router.push(qs ? `/cooperativas/viajes?${qs}` : "/cooperativas/viajes");
  }

  function openDetalle(viaje: any) {
    setSelectedId(viaje.id);
    setSelectedSnapshot(viaje);
    setIsSheetOpen(true);
  }

  /** Calcula el impacto y abre la confirmación. Si el cálculo falla, se abre igual con un texto genérico. */
  async function abrirCancelar(viaje: any) {
    if (revisandoId) return;
    setRevisandoId(viaje.id);
    let impacto: ImpactoCancelarViaje | null = null;
    try {
      const check = await checkBoletosVendidos(viaje.id);
      impacto = check.impacto ?? null;
    } catch {
      impacto = null;
    } finally {
      setRevisandoId(null);
    }
    if (impacto && impacto.pagos_pendientes > 0) {
      // Con pagos por verificar no se puede cancelar: solo el aviso con el enlace a Pagos.
      setBloqueo({ ruta: rutaDe(viaje), salida: viaje.fecha_hora_salida, pendientes: impacto.pagos_pendientes });
      return;
    }
    setViajeCancelar({ id: viaje.id, ruta: rutaDe(viaje), salida: viaje.fecha_hora_salida, impacto });
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
        // Llegó un pago mientras se escribía el motivo: se cierra la confirmación y se
        // muestra solo el aviso con el enlace (sin repetir el error dentro del diálogo).
        setBloqueo({
          ruta: viajeCancelar.ruta,
          salida: viajeCancelar.salida,
          pendientes: res.pendientes ?? (viajeCancelar.impacto?.pagos_pendientes || null),
        });
        return { ok: true };
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

  function imprimir() {
    if (!selectedViaje) return;
    const ok = imprimirManifiesto({
      cooperativa: user.cooperativa_nombre,
      ciudadOrigen: selectedViaje.ruta?.ciudad_origen,
      ciudadDestino: selectedViaje.ruta?.ciudad_destino,
      salida: selectedViaje.fecha_hora_salida,
      numeroUnidad: selectedViaje.numero_unidad,
      nombreChofer: selectedViaje.nombre_chofer,
      pasajeros: viajeBoletos,
      encomiendas: viajeEncomiendas,
      tasa: tasa?.tasa ?? null,
    });
    if (!ok) toast.error(MSG_VENTANA_BLOQUEADA);
  }

  const sinRutas = rutasActivas.length === 0;

  function vacio() {
    if (viajes.length > 0) {
      return (
        <EmptyState icon={CalendarBlank} title="Sin resultados" description="No hay viajes que coincidan con los filtros." />
      );
    }
    if (sinRutas && vista !== "historial") {
      return (
        <EmptyState
          icon={MapTrifold}
          title="Primero crea una ruta con su precio."
          description={
            isAdmin
              ? "Con la ruta y su precio en USD podrás programar salidas y vender boletos."
              : "Cuando el administrador cree rutas y programe salidas, aparecerán aquí."
          }
          action={
            isAdmin ? (
              <Link href="/cooperativas/rutas" className={buttonVariants()}>
                <Plus className="h-4 w-4" weight="bold" aria-hidden />
                Crear ruta
              </Link>
            ) : undefined
          }
        />
      );
    }
    const accionProgramar = isAdmin ? (
      <Button onClick={() => setIsModalOpen(true)}>
        <Plus className="h-4 w-4" weight="bold" aria-hidden />
        Programar salida
      </Button>
    ) : undefined;
    const sinAdmin = "Cuando el administrador programe salidas, aparecerán aquí.";
    if (fecha) {
      return (
        <EmptyState
          icon={CalendarBlank}
          title={`No hay salidas el ${formatFechaCalendario(fecha)}.`}
          description={isAdmin ? "Elige otro día o programa una salida." : sinAdmin}
          action={accionProgramar}
        />
      );
    }
    if (vista === "proximos") {
      return (
        <EmptyState
          icon={CalendarBlank}
          title="No hay salidas en los próximos 7 días."
          description={isAdmin ? "Programa las salidas de la semana para vender boletos." : sinAdmin}
          action={accionProgramar}
        />
      );
    }
    if (vista === "historial") {
      return (
        <EmptyState
          icon={CalendarBlank}
          title="Todavía no hay viajes anteriores."
          description="Los viajes de días pasados aparecerán aquí."
        />
      );
    }
    return (
      <EmptyState
        icon={CalendarBlank}
        title="No hay salidas hoy."
        description={isAdmin ? "Programa una salida para vender boletos de hoy." : sinAdmin}
        action={accionProgramar}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Viajes" description="Programa las salidas de tus rutas y sigue cada viaje.">
        {isAdmin && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" weight="bold" aria-hidden />
            Programar viaje
          </Button>
        )}
      </PageHeader>

      <nav aria-label="Vista de viajes" className="flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => {
          const activa = !fecha && vista === v.valor;
          return (
            <Link
              key={v.valor}
              href={v.valor === "hoy" ? "/cooperativas/viajes" : `/cooperativas/viajes?vista=${v.valor}`}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                activa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              )}
            >
              {v.etiqueta(totalHoy)}
            </Link>
          );
        })}
        {fecha && (
          <span className="rounded-full border border-primary bg-primary-light px-4 py-1.5 text-sm font-medium" aria-current="page">
            Salidas del {formatFechaCalendario(fecha)}
          </span>
        )}
      </nav>

      <div className="flex flex-col sm:flex-row gap-4 bg-muted/50 p-4 rounded-lg border">
        <div className="flex-1 space-y-1">
          <Label htmlFor="filtro-ruta">Ruta</Label>
          <Select value={filterRuta} onValueChange={(val) => setFilterRuta(val ?? "all")} items={[{ value: "all", label: "Todas las rutas" }, ...opcionesRuta]}>
            <SelectTrigger id="filtro-ruta"><SelectValue placeholder="Todas las rutas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {rutasActivas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatCiudad(r.ciudad_origen)} → {formatCiudad(r.ciudad_destino)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="filtro-fecha">Día de salida</Label>
          <Input
            id="filtro-fecha"
            type="date"
            value={fecha ?? ""}
            onChange={(e) => irA({ vista, fecha: e.target.value || null })}
          />
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
        {(filterRuta !== "all" || fecha || filterEstado !== "all") && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setFilterRuta("all");
                setFilterEstado("all");
                if (fecha) irA({ vista: "hoy", fecha: null });
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        {errorCarga && viajes.length === 0 ? (
          <ErrorState titulo="No pudimos cargar los viajes" descripcion={errorCarga} onReintentar={() => router.refresh()} />
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
                <TableRow key={viaje.id} className={cn("relative", viaje.estado === "CANCELADO" && "text-muted-foreground")}>
                  <CeldaEnlace
                    onAbrir={() => openDetalle(viaje)}
                    etiqueta={`Ver viaje ${rutaDe(viaje)} del ${salidaLarga(viaje.fecha_hora_salida)}`}
                  >
                    <span className="flex items-center gap-2">
                      <MapTrifold className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span>{formatCiudad(viaje.ruta?.ciudad_origen)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{formatCiudad(viaje.ruta?.ciudad_destino)}</span>
                    </span>
                  </CeldaEnlace>
                  <TableCell>{formatFechaVE(viaje.fecha_hora_salida, { dateStyle: "short", timeStyle: "short" })}</TableCell>
                  <TableCell>{formatFechaVE(viaje.fecha_hora_llegada_est, { dateStyle: "short", timeStyle: "short" })}</TableCell>
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
                      <Button variant="outline" size="sm" className="relative z-10 mr-1" onClick={() => abrirMarcarSalida(viaje)}>
                        <Bus className="h-4 w-4" aria-hidden />
                        Marcar salida
                      </Button>
                    )}
                    {viaje.estado === "EN_CURSO" && (
                      <Button variant="outline" size="sm" className="relative z-10 mr-1" onClick={() => abrirLlegada(viaje)}>
                        <FlagCheckered className="h-4 w-4" aria-hidden />
                        Marcar llegada
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={revisandoId === viaje.id}
                        className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        <span className="sr-only">Más acciones del viaje {rutaDe(viaje)}</span>
                        {revisandoId === viaje.id ? <Spinner size="sm" /> : <DotsThree className="h-4 w-4" weight="bold" aria-hidden />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetalle(viaje)}>
                          <Eye className="mr-2 h-4 w-4" aria-hidden />
                          Ver detalles
                        </DropdownMenuItem>
                        {isAdmin && viaje.estado === "PROGRAMADO" && (
                          <DropdownMenuItem onClick={() => abrirEditar(viaje)}>
                            <PencilSimple className="mr-2 h-4 w-4" aria-hidden />
                            Editar viaje
                          </DropdownMenuItem>
                        )}
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
                  <TableCell colSpan={7} className="h-48 p-0 text-center text-muted-foreground">
                    {vacio()}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
      {historialRecortado && (
        <p className="text-sm text-muted-foreground">
          Mostrando los últimos 100 viajes. Para ver uno más antiguo, elige su día de salida.
        </p>
      )}

      <ProgramarViajeDialog open={isModalOpen} onOpenChange={setIsModalOpen} rutasActivas={rutasActivas} />

      <EditarViajeDialog viaje={viajeEditar} open={editarOpen} onOpenChange={setEditarOpen} />

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
                  <span className="font-semibold text-base">{rutaDe(selectedViaje)}</span>
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

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={imprimir} disabled={detallesLoading || Boolean(detallesError)}>
                  <Printer className="h-4 w-4" aria-hidden />
                  Imprimir manifiesto
                </Button>
                {isAdmin && selectedViaje?.estado === "PROGRAMADO" && (
                  <Button variant="outline" onClick={() => abrirEditar(selectedViaje)}>
                    <PencilSimple className="h-4 w-4" aria-hidden />
                    Editar viaje
                  </Button>
                )}
                {selectedViaje?.estado === "EN_CURSO" && (
                  <Button variant="outline" onClick={() => abrirLlegada(selectedViaje)}>
                    <FlagCheckered className="h-4 w-4" aria-hidden />
                    Marcar llegada
                  </Button>
                )}
              </div>

              {detallesError && !detallesLoading ? (
                <ErrorState
                  compacto
                  titulo="No pudimos cargar los boletos y encomiendas"
                  descripcion={detallesError}
                  onReintentar={() => (selectedId ? cargarDetalles(selectedId) : undefined)}
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
                                <TableCell className="font-mono text-xs">{formatCodigoBoleto(b.codigo_boleto)}</TableCell>
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
                                    <span className="text-xs text-muted-foreground">{e.receiver_telefono ? formatTelefono(e.receiver_telefono) : ""}</span>
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
        onOpenChange={setCancelarOpen}
        tono="destructive"
        titulo={viajeCancelar ? `¿Cancelar el viaje ${viajeCancelar.ruta} del ${salidaLarga(viajeCancelar.salida)}?` : "¿Cancelar el viaje?"}
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

      <AlertDialog open={bloqueo !== null} onOpenChange={(abierto) => !abierto && setBloqueo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bloqueo ? `Todavía no puedes cancelar el viaje ${bloqueo.ruta} del ${salidaLarga(bloqueo.salida)}` : "Todavía no puedes cancelar el viaje"}
            </AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <AvisoPagosPendientes n={bloqueo?.pendientes ?? null} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={llegadaOpen && viajeLlegada !== null}
        onOpenChange={setLlegadaOpen}
        titulo={viajeLlegada ? `¿El bus de ${rutaDe(viajeLlegada)} ya llegó?` : "¿El bus ya llegó?"}
        impacto={[
          "El viaje quedará como «Completado».",
          "Los pasajeros que no embarcaron quedan registrados en el viaje.",
        ]}
        verbo="Marcar llegada"
        verboCargando="Registrando…"
        textoCancelar="Todavía no"
        onConfirm={confirmarLlegada}
      />

      <MarcarSalidaDialog viaje={viajeSalida} open={salidaOpen && viajeSalida !== null} onOpenChange={setSalidaOpen} />
    </div>
  );
}
