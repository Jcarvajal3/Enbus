"use client";

import { useState, useEffect, useMemo, useRef, useTransition, useId, type FormEvent, type TransitionStartFunction } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DotsThree, Eye, Info, PencilSimple, Plus, XCircle, WarningCircle } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { guardarViaje, cancelarViaje, checkBoletosVendidos, editarViaje } from "./actions";
import { DIAS_SEMANA, planificarSalidas, resumenSalidas, textoBotonSalidas } from "./salidas";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { AvisoError } from "@/components/aviso-error";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CeldaEnlace } from "@/components/celda-enlace";
import { requireOnline } from "@/components/connectivity-banner";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { Monto } from "@/components/monto";
import { ViajeSheet, paraSalida, rutaViaje } from "@/components/viajes/viaje-sheet";
import { MarcarLlegadaDialog, MarcarSalidaDialog, type ViajeParaSalida } from "@/components/viajes/marcar-viaje-dialogs";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { estadosDe, etiquetaEstado } from "@/lib/estados";
import { fechaVE, formatDiaVE, formatFechaHoraCortaVE, formatFechaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import type { ImpactoCancelarViaje } from "@/lib/types/reembolsos";
import { formatCiudad } from "@/lib/ciudades";
import { cn } from "@/lib/utils";

export type VistaViajes = "hoy" | "proximos" | "historial";

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "05/11 · 8:00 a. m." (hora de Venezuela, D4). */
function salidaLarga(iso: string) {
  return formatFechaHoraCortaVE(iso);
}

/** ISO → 'YYYY-MM-DDTHH:mm' en hora de Venezuela (para un input datetime-local). */
function isoALocalVE(iso: string) {
  return `${fechaVE(iso)}T${formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
}

const MOTIVOS_CANCELAR_VIAJE = ["Falla mecánica", "Vía cerrada o mal tiempo", "Pocos pasajeros", "Otro"];

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
          avisarExito(
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
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Programar viaje</DialogTitle>
        <DialogDescription>Hora de Venezuela.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        <div className="grid gap-6">
          {formError && <AvisoError>{formError}</AvisoError>}

          <div className="grid content-start gap-2">
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
              <p className="text-sm text-muted-foreground">
                No tienes rutas activas.{" "}
                <Link href="/cooperativas/rutas" className="font-medium text-info-text underline underline-offset-4">
                  Crea una ruta
                </Link>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-recurrente`}>Viaje recurrente</Label>
              <p className="text-sm text-muted-foreground">Una salida por cada día elegido.</p>
            </div>
            <Switch id={`${uid}-recurrente`} checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring ? (
            <div className="grid gap-4 rounded-md bg-muted/50 p-4">
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
                        variant="outline"
                        aria-pressed={activo}
                        aria-label={d.nombre}
                        onClick={() => alternarDia(d.valor)}
                        className={cn(
                          "min-w-12",
                          activo && "border-accent-strong bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong/90"
                        )}
                      >
                        {d.corto}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor={`${uid}-hora`}>Hora de salida</Label>
                <Input id={`${uid}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-desde`}>Desde</Label>
                  <Input id={`${uid}-desde`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
                </div>
                <div className="grid content-start gap-2">
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
                  <AvisoError>{errorPlan.error}</AvisoError>
                ) : plan.ok ? (
                  <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
                    <Info className="mt-0.5 size-4 shrink-0 text-info-text" weight="fill" aria-hidden />
                    {resumenSalidas(plan)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-salida`}>Fecha y hora de salida</Label>
              <Input id={`${uid}-salida`} type="datetime-local" value={salida} onChange={(e) => setSalida(e.target.value)} required />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid content-start gap-2">
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
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-unidad`}>Unidad (opcional)</Label>
              <Input id={`${uid}-unidad`} type="text" maxLength={40} value={unidad} onChange={(e) => setUnidad(e.target.value)} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-chofer`}>Chofer (opcional)</Label>
              <Input id={`${uid}-chofer`} type="text" maxLength={80} value={chofer} onChange={(e) => setChofer(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
            {isPending && <Spinner size="sm" />}
            {isPending ? "Programando…" : isRecurring ? textoBotonSalidas(plan) : "Programar viaje"}
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
      avisarInfo("No hay cambios que guardar.");
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
      avisarExito(
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
    <DialogContent showCloseButton={!enviando}>
      <form onSubmit={enviar} noValidate className="grid gap-5">
        <DialogHeader>
          <DialogTitle>Editar viaje</DialogTitle>
          <DialogDescription>
            {ruta} · {salidaLarga(viaje.fecha_hora_salida)}
          </DialogDescription>
        </DialogHeader>

        {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

        <div className="grid content-start gap-2">
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
            <p id={`${uid}-salida-ayuda`} className="text-sm text-muted-foreground">
              Hora de Venezuela.
            </p>
          )}
        </div>

        {cambiaHora && (
          <div className="grid gap-3 rounded-md border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
            <p className="flex items-start gap-2" role="status">
              <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
              {pasajeros === null
                ? "Si hay pasajeros, les avisaremos del cambio de hora."
                : pasajeros === 0
                  ? "Este viaje no tiene pasajeros: no hace falta avisar a nadie."
                  : plural(pasajeros, "Avisaremos a 1 pasajero del cambio de hora.", "Avisaremos a {n} pasajeros del cambio de hora.")}
            </p>
            {pideMotivo && (
              <div className="grid content-start gap-2">
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
          <div className="grid content-start gap-2">
            <Label htmlFor={`${uid}-unidad`}>Unidad</Label>
            <Input id={`${uid}-unidad`} value={unidad} maxLength={40} disabled={enviando} onChange={(e) => setUnidad(e.target.value)} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={`${uid}-chofer`}>Chofer</Label>
            <Input id={`${uid}-chofer`} value={chofer} maxLength={80} disabled={enviando} onChange={(e) => setChofer(e.target.value)} />
          </div>
        </div>

        <div className="grid content-start gap-2">
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
            <p id={`${uid}-asientos-ayuda`} className="text-sm text-muted-foreground">
              {minimoAsientos
                ? `Mínimo ${minimoAsientos}: ya hay pasajeros hasta ese asiento.`
                : "No puede ser menor que el asiento más alto ya vendido."}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
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

const VISTAS: { valor: VistaViajes; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "proximos", etiqueta: "Próximos 7 días" },
  { valor: "historial", etiqueta: "Historial" },
];

/** Parámetros que no son de la lista (vista y día van en la ruta; el viaje abierto, aparte). */
const PARAMS_PROPIOS = ["vista", "fecha", "viaje", "pagina"];

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
  /** Salidas de hoy (más las que están en curso), para el conteo de "Hoy". */
  totalHoy?: number | null;
  /** El historial llegó al límite de 100. */
  historialRecortado?: boolean;
  /** Error al cargar la lista (ya traducido). */
  errorCarga?: string | null;
}) {
  const isAdmin = userRole === "admin_cooperativa";
  const router = useRouter();
  const searchParams = useSearchParams();
  const cambiarParams = useCambiarParams();

  // Filtros y viaje abierto en la URL (§2.1 regla 5).
  const [filterRuta] = useParamUrl("ruta");
  const [filterEstado] = useParamUrl("estado");
  const [viajeAbierto] = useParamUrl("viaje");
  const abrirViaje = (id: string | null) => cambiarParams({ viaje: id }, { conservarPagina: true });
  const [recargaHoja, setRecargaHoja] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);

  // "Cancelar viaje" (solo administrador). Se conserva el viaje al cerrar para la animación.
  const [viajeCancelar, setViajeCancelar] = useState<ViajeACancelar | null>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [revisandoId, setRevisandoId] = useState<string | null>(null);
  /** Pagos por verificar que bloquean la cancelación. */
  const [bloqueo, setBloqueo] = useState<{ ruta: string; salida: string; pendientes: number | null } | null>(null);

  // "Marcar salida" y "Marcar llegada" desde la fila (ambos roles)
  const [viajeSalida, setViajeSalida] = useState<ViajeParaSalida | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [viajeLlegada, setViajeLlegada] = useState<ViajeParaSalida | null>(null);
  const [llegadaOpen, setLlegadaOpen] = useState(false);

  // "Editar viaje" (admin, PROGRAMADO)
  const [viajeEditar, setViajeEditar] = useState<any | null>(null);
  const [editarOpen, setEditarOpen] = useState(false);

  function abrirMarcarSalida(viaje: any) {
    setViajeSalida(paraSalida(viaje));
    setSalidaOpen(true);
  }

  function abrirLlegada(viaje: any) {
    setViajeLlegada(paraSalida(viaje));
    setLlegadaOpen(true);
  }

  function abrirEditar(viaje: any) {
    setViajeEditar(viaje);
    setEditarOpen(true);
  }

  const opcionesRuta = rutasActivas.map((r) => ({
    valor: r.id as string,
    etiqueta: `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`,
  }));
  const opcionesEstado = estadosDe("viaje").map((e) => ({ valor: e, etiqueta: etiquetaEstado("viaje", e) }));

  const filteredViajes = useMemo(
    () =>
      viajes.filter((v) => {
        if (filterRuta && v.ruta_id !== filterRuta) return false;
        if (filterEstado && v.estado !== filterEstado) return false;
        return true;
      }),
    [viajes, filterRuta, filterEstado]
  );
  const { visibles, pagina, paginas, ir } = usePaginacion(filteredViajes);

  /** Enlace a otra pestaña: conserva los filtros del cliente y quita el día. */
  function hrefVista(v: VistaViajes) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const p of PARAMS_PROPIOS) sp.delete(p);
    if (v !== "hoy") sp.set("vista", v);
    const qs = sp.toString();
    return qs ? `/cooperativas/viajes?${qs}` : "/cooperativas/viajes";
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
      setBloqueo({ ruta: rutaViaje(viaje), salida: viaje.fecha_hora_salida, pendientes: impacto.pagos_pendientes });
      return;
    }
    setViajeCancelar({ id: viaje.id, ruta: rutaViaje(viaje), salida: viaje.fecha_hora_salida, impacto });
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
      avisarInfo("Este viaje ya estaba cancelado.");
    } else {
      const n = r.boletos_reembolso ?? 0;
      if (n > 0) {
        toast.success(`Viaje cancelado. ${plural(n, "1 reembolso pendiente.", "{n} reembolsos pendientes.")}`, {
          duration: 3000,
          action: { label: "Ver reembolsos", onClick: () => router.push("/cooperativas/reembolsos") },
        });
      } else if ((r.reservas_anuladas ?? 0) > 0) {
        avisarExito("Viaje cancelado. Avisamos a los pasajeros que tenían reservas.");
      } else {
        avisarExito("Viaje cancelado.");
      }
    }
    abrirViaje(null);
    return { ok: true };
  }

  const sinRutas = rutasActivas.length === 0;
  const COLUMNAS = 7;

  function filaVacia() {
    if (viajes.length > 0) {
      return <FilaVacia colSpan={COLUMNAS} icon={ICONO_SECCION.viajes} titulo="No hay viajes con estos filtros" />;
    }
    if (sinRutas && vista !== "historial") {
      return (
        <FilaVacia
          colSpan={COLUMNAS}
          icon={ICONO_SECCION.rutas}
          titulo="Primero crea una ruta con su precio"
          accion={
            isAdmin ? (
              <Link href="/cooperativas/rutas" className={buttonVariants()}>
                <Plus aria-hidden />
                Crear ruta
              </Link>
            ) : undefined
          }
        />
      );
    }
    const accionProgramar = isAdmin ? (
      <Button onClick={() => setIsModalOpen(true)}>
        <Plus aria-hidden />
        Programar viaje
      </Button>
    ) : undefined;
    const titulo = fecha
      ? `No hay salidas el ${formatDiaVE(fecha)}`
      : vista === "proximos"
        ? "No hay salidas en los próximos 7 días"
        : vista === "historial"
          ? "Todavía no hay viajes anteriores"
          : "No hay salidas hoy";
    return (
      <FilaVacia
        colSpan={COLUMNAS}
        icon={ICONO_SECCION.viajes}
        titulo={titulo}
        accion={vista === "historial" && !fecha ? undefined : accionProgramar}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Viajes">
        {isAdmin && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus aria-hidden />
            Programar viaje
          </Button>
        )}
      </PageHeader>

      <Tabs value={fecha ? "fecha" : vista}>
        <TabsList aria-label="Vista de viajes">
          {VISTAS.map((v) => (
            <TabsTrigger key={v.valor} value={v.valor} className="group/tab flex-none" render={<Link href={hrefVista(v.valor)} />}>
              {v.etiqueta}
              {v.valor === "hoy" && totalHoy !== null && totalHoy > 0 && (
                <span className="min-w-5 rounded-full bg-background px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-muted">
                  {totalHoy}
                </span>
              )}
            </TabsTrigger>
          ))}
          {fecha && (
            <TabsTrigger value="fecha" className="flex-none">
              {formatDiaVE(fecha)}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <BarraFiltros
        selects={[
          { param: "ruta", etiqueta: "Ruta", opciones: opcionesRuta },
          { param: "estado", etiqueta: "Estado", opciones: opcionesEstado, todas: "Todos" },
        ]}
        fechas={[{ param: "fecha", etiqueta: "Día de salida" }]}
      />

      <Card className="gap-0 overflow-hidden p-0">
        {errorCarga && viajes.length === 0 ? (
          <ErrorState titulo="No pudimos cargar los viajes" descripcion={errorCarga} onReintentar={() => router.refresh()} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Llegada estimada</TableHead>
                  <TableHead className="text-right">Asientos libres</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredViajes.length === 0
                  ? filaVacia()
                  : visibles.map((viaje) => (
                      <TableRow key={viaje.id} className={cn("relative", viaje.estado === "CANCELADO" && "text-muted-foreground")}>
                        <CeldaEnlace
                          onAbrir={() => abrirViaje(viaje.id)}
                          etiqueta={`Ver viaje ${rutaViaje(viaje)} del ${salidaLarga(viaje.fecha_hora_salida)}`}
                        >
                          {rutaViaje(viaje)}
                        </CeldaEnlace>
                        <TableCell className="tabular-nums">{formatFechaHoraCortaVE(viaje.fecha_hora_salida)}</TableCell>
                        <TableCell className="hidden tabular-nums 2xl:table-cell">
                          {viaje.fecha_hora_llegada_est ? formatFechaHoraCortaVE(viaje.fecha_hora_llegada_est) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="font-medium">{viaje.asientos_disponibles}</span>
                          <span className="text-muted-foreground"> / {viaje.asientos_totales}</span>
                        </TableCell>
                        <TableCell className="hidden text-right xl:table-cell">
                          {Number(viaje.ruta?.precio_pasaje) > 0 ? (
                            <Monto usd={Number(viaje.ruta.precio_pasaje)} size="sm" align="right" />
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin precio</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={viaje.estado} dominio="viaje" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {viaje.estado === "PROGRAMADO" && (
                              <Button variant="outline" size="sm" className="relative z-10" onClick={() => abrirMarcarSalida(viaje)}>
                                Marcar salida
                              </Button>
                            )}
                            {viaje.estado === "EN_CURSO" && (
                              <Button variant="outline" size="sm" className="relative z-10" onClick={() => abrirLlegada(viaje)}>
                                Marcar llegada
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                disabled={revisandoId === viaje.id}
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="relative z-10"
                                    aria-label={`Más acciones del viaje ${rutaViaje(viaje)}`}
                                  />
                                }
                              >
                                {revisandoId === viaje.id ? <Spinner size="sm" /> : <DotsThree aria-hidden />}
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => abrirViaje(viaje.id)}>
                                  <Eye aria-hidden />
                                  Ver viaje
                                </DropdownMenuItem>
                                {isAdmin && viaje.estado === "PROGRAMADO" && (
                                  <DropdownMenuItem onClick={() => abrirEditar(viaje)}>
                                    <PencilSimple aria-hidden />
                                    Editar viaje
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && viaje.estado === "PROGRAMADO" && (
                                  <DropdownMenuItem variant="destructive" onClick={() => void abrirCancelar(viaje)}>
                                    <XCircle aria-hidden />
                                    Cancelar viaje
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
            <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
          </>
        )}
      </Card>
      {historialRecortado && (
        <p className="text-sm text-muted-foreground">Últimos 100 viajes. Para uno más antiguo, elige su día de salida.</p>
      )}

      <ProgramarViajeDialog open={isModalOpen} onOpenChange={setIsModalOpen} rutasActivas={rutasActivas} />

      <EditarViajeDialog
        viaje={viajeEditar}
        open={editarOpen}
        onOpenChange={(abierto) => {
          setEditarOpen(abierto);
          if (!abierto) setRecargaHoja((n) => n + 1);
        }}
      />

      <ViajeSheet
        viajeId={viajeAbierto || null}
        onOpenChange={(abierto) => !abierto && abrirViaje(null)}
        onCambio={() => router.refresh()}
        onEditar={isAdmin ? abrirEditar : undefined}
        onCancelar={isAdmin ? (v) => void abrirCancelar(v) : undefined}
        cancelando={revisandoId !== null && revisandoId === viajeAbierto}
        recarga={recargaHoja}
      />

      <ConfirmDialog
        open={cancelarOpen && viajeCancelar !== null}
        onOpenChange={setCancelarOpen}
        tono="destructive"
        titulo={viajeCancelar ? `¿Cancelar el viaje ${viajeCancelar.ruta} del ${salidaLarga(viajeCancelar.salida)}?` : "¿Cancelar el viaje?"}
        impacto={lineasImpacto(viajeCancelar?.impacto ?? null)}
        motivo={{
          etiqueta: "Motivo (lo verán los pasajeros)",
          placeholder: "Ej.: Falla mecánica de la unidad",
          minimo: 5,
          chips: MOTIVOS_CANCELAR_VIAJE,
        }}
        verbo="Cancelar viaje"
        verboCargando="Cancelando…"
        onConfirm={confirmarCancelar}
      />

      <ConfirmDialog
        open={bloqueo !== null}
        onOpenChange={(abierto) => !abierto && setBloqueo(null)}
        titulo="Todavía no puedes cancelar este viaje"
        descripcion={
          <p className="flex items-start gap-2">
            <WarningCircle className="mt-0.5 size-4 shrink-0 text-warning-text" weight="fill" aria-hidden />
            {bloqueo?.pendientes && bloqueo.pendientes > 0
              ? plural(bloqueo.pendientes, "Tiene 1 pago por verificar.", "Tiene {n} pagos por verificar.")
              : "Tiene pagos por verificar."}{" "}
            Apruébalos o recházalos antes.
          </p>
        }
        verbo="Verificar pagos"
        onConfirm={async () => {
          router.push("/cooperativas/pagos?tipo=boleto");
          return { ok: true };
        }}
      />

      <MarcarSalidaDialog
        viaje={viajeSalida}
        open={salidaOpen}
        onOpenChange={setSalidaOpen}
        onHecho={() => {
          setRecargaHoja((n) => n + 1);
          router.refresh();
        }}
      />
      <MarcarLlegadaDialog
        viaje={viajeLlegada}
        open={llegadaOpen}
        onOpenChange={setLlegadaOpen}
        onHecho={() => {
          setRecargaHoja((n) => n + 1);
          router.refresh();
        }}
      />
    </div>
  );
}
