"use client";

import { useState, useEffect, useMemo, useRef, useId, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DotsThree, Eye, PencilSimple, Plus, XCircle, WarningCircle } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { asignarUnidad, cancelarViaje, checkBoletosVendidos, editarViaje } from "./actions";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { AvisoError } from "@/components/aviso-error";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { requireOnline } from "@/components/connectivity-banner";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { Monto } from "@/components/monto";
import { ViajeSheet, paraSalida, rutaViaje } from "@/components/viajes/viaje-sheet";
import { MarcarLlegadaDialog, MarcarSalidaDialog, type ViajeParaSalida } from "@/components/viajes/marcar-viaje-dialogs";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { estadosDe, etiquetaEstado } from "@/lib/estados";
import { fechaVE, formatDiaVE, formatFechaHoraCortaVE, formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import type { ImpactoCancelarViaje } from "@/lib/types/reembolsos";
import type { BusParaViaje } from "@/lib/types/operacion";
import { formatCiudad } from "@/lib/ciudades";
import { cn } from "@/lib/utils";

/** Color del cuadrito del estado de un viaje en la lista móvil. */
const TONO_VIAJE: Record<string, IconTileTone> = {
  PROGRAMADO: "sky",
  EN_CURSO: "info",
  COMPLETADO: "success",
  CANCELADO: "neutral",
};

export type VistaViajes = "hoy" | "manana" | "proximos" | "historial";

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "05/11 · 8:00 a. m." (hora de Venezuela, D4). */
function salidaLarga(iso: string) {
  return formatFechaHoraCortaVE(iso);
}

/** "vie 28 nov, 8:00 p. m." (hora de Venezuela). */
function textoSalida(iso: string) {
  return formatFechaVE(iso, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
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

// ─── Selector de bus (Editar viaje y desplegable de Unidad) ──────────────────

/** "Unidad 12 · 42 asientos" (opciones del selector de bus). */
function etiquetaBus(bus: BusParaViaje) {
  return `${bus.numero_unidad} · ${plural(bus.asientos, "1 asiento", "{n} asientos")}`;
}

/** Valor del select de bus para "sin bus". */
const SIN_BUS = "__ninguna";

/** Aviso bajo el selector de bus cuando no hay buses activos (o no se pudieron cargar). */
function AvisoSinBuses({ errorBuses }: { errorBuses: string | null }) {
  if (errorBuses) return <p className="text-[13px] text-destructive-text">{errorBuses}</p>;
  return (
    <p className="text-[13px] text-muted-foreground">
      No tienes buses activos.{" "}
      <Link href="/cooperativas/buses" className="font-medium text-info-text underline underline-offset-4">
        Registra un bus
      </Link>
    </p>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Unidad de la salida: desplegable con confirmación ───────────────────────
// Sin botón Guardar: al elegir otro valor se pide confirmar (ver ViajesClient). El
// servidor (fn_asignar_bus) valida choque de horario y puestos; aquí solo hay pistas.

/** Pide confirmar la unidad elegida para una salida. `busId` null = dejarla sin unidad. */
type CambioUnidad = { viaje: any; busId: string | null };

function SelectorUnidad({
  viaje,
  viajes,
  busesActivos,
  errorBuses,
  onElegir,
}: {
  viaje: any;
  viajes: any[];
  busesActivos: BusParaViaje[];
  errorBuses: string | null;
  onElegir(cambio: CambioUnidad): void;
}) {
  const actual: string | null = viaje.bus_id ?? null;
  const vendidos = Math.max(Number(viaje.asientos_totales) - Number(viaje.asientos_disponibles), 0);

  /** Otra salida programada de la lista que usa ese bus a la misma hora. */
  function choque(busId: string) {
    const ini = Date.parse(viaje.fecha_hora_salida);
    const fin = Date.parse(viaje.fecha_hora_llegada_est ?? "") || ini;
    return viajes.find((o) => {
      if (o.id === viaje.id || o.bus_id !== busId || o.estado !== "PROGRAMADO") return false;
      const oIni = Date.parse(o.fecha_hora_salida);
      const oFin = Date.parse(o.fecha_hora_llegada_est ?? "") || oIni;
      return ini < oFin && oIni < fin;
    });
  }

  function etiqueta(b: BusParaViaje) {
    const base = `${b.numero_unidad} · ${plural(b.asientos, "1 puesto", "{n} puestos")}`;
    if (b.id === actual) return base;
    const otro = choque(b.id);
    if (otro) return `${base} · ya sale a las ${formatHoraVE(otro.fecha_hora_salida)}`;
    if (b.asientos < vendidos) return `${base} · no alcanza (${plural(vendidos, "1 vendido", "{n} vendidos")})`;
    return base;
  }

  const opciones = [
    { value: SIN_BUS, label: "Por asignar" },
    // Un bus que ya no está activo se sigue mostrando mientras la salida lo tenga.
    ...(actual && !busesActivos.some((b) => b.id === actual)
      ? [{ value: actual, label: viaje.numero_unidad || "Unidad actual" }]
      : []),
    ...busesActivos.map((b) => ({ value: b.id, label: etiqueta(b) })),
  ];

  return (
    <Select
      value={actual ?? SIN_BUS}
      items={opciones}
      onValueChange={(val) => {
        const nuevo = !val || val === SIN_BUS ? null : val;
        if (nuevo !== actual) onElegir({ viaje, busId: nuevo });
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "relative z-10 w-full min-w-36 max-md:h-12",
          // Sin unidad: naranja, para que salte a la vista qué salidas faltan por asignar.
          !actual &&
            "border-warning bg-warning/15 font-medium text-warning-text hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25 [&_svg]:text-warning-text"
        )}
        aria-label={`Unidad de la salida ${rutaViaje(viaje)} del ${salidaLarga(viaje.fecha_hora_salida)}`}
        title={busesActivos.length === 0 && errorBuses ? errorBuses : undefined}
      >
        <SelectValue placeholder="Por asignar" />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Editar viaje (#52, P-48) ────────────────────────────────────────────────

function EditarViajeDialog({
  viaje,
  open,
  onOpenChange,
  busesActivos,
  errorBuses,
}: {
  viaje: any | null;
  open: boolean;
  onOpenChange(abierto: boolean): void;
  busesActivos: BusParaViaje[];
  errorBuses: string | null;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      {open && viaje && (
        <FormularioEditar
          key={viaje.id}
          viaje={viaje}
          busesActivos={busesActivos}
          errorBuses={errorBuses}
          enviando={enviando}
          setEnviando={setEnviando}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

type CampoEditar = "salida" | "bus" | "asientos" | "motivo";

function FormularioEditar({
  viaje,
  busesActivos,
  errorBuses,
  enviando,
  setEnviando,
  onCerrar,
}: {
  viaje: any;
  busesActivos: BusParaViaje[];
  errorBuses: string | null;
  enviando: boolean;
  setEnviando(v: boolean): void;
  onCerrar(): void;
}) {
  const uid = useId();
  const supabase = useMemo(() => createClient(), []);
  const enviandoRef = useRef(false);
  const salidaInicial = isoALocalVE(viaje.fecha_hora_salida);
  const [salida, setSalida] = useState(salidaInicial);
  const busInicial: string = viaje.bus_id ?? "";
  const [busId, setBusId] = useState<string>(busInicial);
  const [unidad, setUnidad] = useState<string>(viaje.numero_unidad ?? "");
  const [chofer, setChofer] = useState<string>(viaje.nombre_chofer ?? "");
  const [asientos, setAsientos] = useState<string>(String(viaje.asientos_totales ?? ""));
  // "Sin unidad": deja la salida por asignar (fn_asignar_bus con bus nulo).
  const [quitar, setQuitar] = useState(false);
  const cambiaBus = !quitar && busId !== "" && busId !== busInicial;
  const tieneUnidad = Boolean(busInicial || viaje.numero_unidad);
  // Bus elegido (null si el viaje no tiene bus o el suyo ya está desactivado).
  const bus = busesActivos.find((b) => b.id === busId) ?? null;
  // Tope de asientos: los del bus, si se conoce; si no, el máximo general.
  const capacidad = bus?.asientos ?? 80;
  // El bus actual puede estar desactivado: sigue como opción (sin cambio) con su unidad.
  const opcionesBus = [
    ...(tieneUnidad ? [{ value: SIN_BUS, label: "Sin unidad (por asignar)" }] : []),
    ...(busInicial && !busesActivos.some((b) => b.id === busInicial)
      ? [{ value: busInicial, label: `${viaje.numero_unidad ?? "Bus actual"} (desactivado)` }]
      : []),
    ...busesActivos.map((b) => ({ value: b.id, label: etiquetaBus(b) })),
  ];
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
    } else if (bus && nAsientos > bus.asientos && (cambiaBus || nAsientos !== Number(viaje.asientos_totales))) {
      encontrados.asientos = `El bus ${bus.numero_unidad} tiene ${bus.asientos} asientos: el viaje no puede tener más.`;
    }
    if (pideMotivo && motivo.trim().length < 5) {
      encontrados.motivo = "Explica por qué cambia la hora (mínimo 5 caracteres). Les enviaremos tu mensaje.";
    }
    setErrores(encontrados);
    const primero = (["salida", "bus", "asientos", "motivo"] as CampoEditar[]).find((c) => encontrados[c]);
    if (primero) {
      enfocar(primero);
      return;
    }

    const cambios = {
      salida: cambiaHora ? salida : undefined,
      busId: cambiaBus ? busId : undefined,
      quitarUnidad: quitar ? true : undefined,
      // Con bus, la unidad es la del bus (la base la copia); a mano solo en viajes con unidad sin bus.
      numeroUnidad: !quitar && !busId && viaje.numero_unidad && unidad.trim() !== viaje.numero_unidad ? unidad : undefined,
      nombreChofer: !quitar && chofer.trim() !== (viaje.nombre_chofer ?? "") ? chofer : undefined,
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
        if (campo === "salida" || campo === "bus" || campo === "asientos" || campo === "motivo") {
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
            <p id={`${uid}-salida-error`} className="text-[13px] text-destructive-text">{errores.salida}</p>
          ) : (
            <p id={`${uid}-salida-ayuda`} className="text-[13px] text-muted-foreground">
              Hora de Venezuela.
            </p>
          )}
        </div>

        {cambiaHora && (
          <div className="grid gap-3 rounded-md bg-warning-light p-4 text-[13px] text-warning-deep">
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

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-bus`}>Bus</Label>
          <Select
            value={quitar ? SIN_BUS : busId}
            onValueChange={(val) => {
              if (val === SIN_BUS) {
                setQuitar(true);
                setBusId("");
                limpiar("bus");
                limpiar("asientos");
                setAsientos(String(viaje.asientos_totales ?? ""));
                return;
              }
              setQuitar(false);
              const id = val ?? "";
              setBusId(id);
              limpiar("bus");
              limpiar("asientos");
              // Otro bus: se copian su unidad, su chofer y sus asientos (se pueden ajustar).
              const nuevo = busesActivos.find((b) => b.id === id);
              if (nuevo && id !== busInicial) {
                setUnidad(nuevo.numero_unidad);
                setChofer(nuevo.chofer_nombre ?? "");
                setAsientos(String(nuevo.asientos));
              } else if (id === busInicial) {
                setUnidad(viaje.numero_unidad ?? "");
                setChofer(viaje.nombre_chofer ?? "");
                setAsientos(String(viaje.asientos_totales ?? ""));
              }
            }}
            items={opcionesBus}
            disabled={enviando}
          >
            <SelectTrigger
              id={`${uid}-bus`}
              className="w-full"
              aria-invalid={errores.bus ? true : undefined}
              aria-describedby={ayuda("bus") ?? `${uid}-bus-ayuda`}
            >
              <SelectValue placeholder={viaje.numero_unidad ? `${viaje.numero_unidad} (sin bus registrado)` : "Por asignar: elige un bus"} />
            </SelectTrigger>
            <SelectContent>
              {opcionesBus.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errores.bus ? (
            <p id={`${uid}-bus-error`} className="text-[13px] text-destructive-text">{errores.bus}</p>
          ) : busesActivos.length === 0 ? (
            <div id={`${uid}-bus-ayuda`}>
              <AvisoSinBuses errorBuses={errorBuses} />
            </div>
          ) : (
            <p id={`${uid}-bus-ayuda`} className="text-[13px] text-muted-foreground">
              {quitar
                ? "La salida quedará por asignar. Los asientos no cambian."
                : cambiaBus
                  ? "Se copian la unidad, el chofer y los asientos del bus elegido."
                  : busId
                    ? "Si cambias de bus, se copian su unidad, su chofer y sus asientos."
                    : viaje.numero_unidad
                      ? "Este viaje no tiene un bus registrado: elige uno o corrige la unidad."
                      : "Este viaje no tiene unidad. Elige un bus."}
            </p>
          )}
        </div>

        <div className={cn("grid grid-cols-1 gap-5 md:gap-4", !busId && viaje.numero_unidad && !quitar && "md:grid-cols-2")}>
          {/* Viajes anteriores con unidad pero sin bus: la unidad sigue siendo a mano. */}
          {!busId && viaje.numero_unidad && !quitar && (
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-unidad`}>Unidad</Label>
              <Input id={`${uid}-unidad`} value={unidad} maxLength={40} disabled={enviando} onChange={(e) => setUnidad(e.target.value)} />
            </div>
          )}
          {!quitar && (busId || viaje.numero_unidad) && (
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-chofer`}>Chofer</Label>
              <Input id={`${uid}-chofer`} value={chofer} maxLength={80} disabled={enviando} onChange={(e) => setChofer(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-asientos`}>Asientos</Label>
          <Input
            id={`${uid}-asientos`}
            type="number"
            inputMode="numeric"
            min={minimoAsientos ?? 1}
            max={capacidad}
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
            <p id={`${uid}-asientos-error`} className="text-[13px] text-destructive-text">{errores.asientos}</p>
          ) : (
            <p id={`${uid}-asientos-ayuda`} className="text-[13px] text-muted-foreground">
              {minimoAsientos
                ? `Mínimo ${minimoAsientos}: ya hay pasajeros hasta ese asiento.`
                : "No puede ser menor que el asiento más alto ya vendido."}
              {bus ? ` Máximo ${bus.asientos}: los del bus.` : ""}
            </p>
          )}
        </div>

        <DialogFooter className="md:justify-between">
          <Button type="button" variant="outline" size="lg" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={enviando} aria-busy={enviando || undefined}>
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
  { valor: "manana", etiqueta: "Mañana" },
  { valor: "proximos", etiqueta: "Próximos 7 días" },
  { valor: "historial", etiqueta: "Historial" },
];

/** Parámetros que no son de la lista (vista y día van en la ruta; el viaje abierto, aparte). */
const PARAMS_PROPIOS = ["vista", "fecha", "viaje", "pagina"];

export function ViajesClient({
  viajes,
  rutasActivas,
  busesActivos = [],
  errorBuses = null,
  userRole,
  vista = "hoy",
  fecha = null,
  totalHoy = null,
  historialRecortado = false,
  errorCarga = null,
}: {
  viajes: any[];
  rutasActivas: any[];
  /** Buses activos de la cooperativa (desplegable de Unidad y Editar viaje). */
  busesActivos?: BusParaViaje[];
  /** Error al cargar los buses (ya traducido): lo muestra el desplegable de Unidad. */
  errorBuses?: string | null;
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

  // Cambio de unidad pendiente de confirmar (se conserva al cerrar para la animación).
  const [cambioUnidad, setCambioUnidad] = useState<CambioUnidad | null>(null);
  const [unidadOpen, setUnidadOpen] = useState(false);

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

  function pedirCambioUnidad(cambio: CambioUnidad) {
    setCambioUnidad(cambio);
    setUnidadOpen(true);
  }

  async function confirmarUnidad() {
    if (!cambioUnidad) return { ok: false, error: "No encontramos la salida. Actualiza la página." };
    const { viaje, busId } = cambioUnidad;
    try {
      const res = await requireOnline(() => asignarUnidad({ viajeId: viaje.id, busId }))();
      if (!res.success) {
        // El valor del desplegable no cambia hasta que la lista se recarga: vuelve solo al anterior.
        avisarError(res.error);
        return { ok: true };
      }
      avisarExito(busId ? "Unidad asignada." : "Salida sin unidad.");
      setRecargaHoja((n) => n + 1);
      router.refresh();
    } catch (err) {
      avisarError(humanizeError(err, "asignar la unidad"));
    }
    return { ok: true };
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
  const COLUMNAS = 8;

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
              <Link href="/cooperativas/rutas" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Plus aria-hidden />
                Crear ruta
              </Link>
            ) : undefined
          }
        />
      );
    }
    const accionRutas = isAdmin ? (
      <Link href="/cooperativas/rutas" className={buttonVariants({ variant: "outline", size: "lg" })}>
        Configurar salidas en Rutas
      </Link>
    ) : undefined;
    const titulo = fecha
      ? `No hay salidas el ${formatDiaVE(fecha)}`
      : vista === "manana"
        ? "No hay salidas mañana"
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
        accion={vista === "historial" && !fecha ? undefined : accionRutas}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <PageHeader title="Viajes" />
      {isAdmin && (
        <p className="-mt-4 text-[13px] text-muted-foreground">
          Las salidas se configuran en{" "}
          <Link href="/cooperativas/rutas" className="font-medium text-info-text underline underline-offset-4">
            Rutas
          </Link>
          .
        </p>
      )}

      <Tabs value={fecha ? "fecha" : vista}>
        <TabsList aria-label="Vista de viajes">
          {VISTAS.map((v) => (
            <TabsTrigger key={v.valor} value={v.valor} className="group/tab flex-none" render={<Link href={hrefVista(v.valor)} />}>
              {v.etiqueta}
              {v.valor === "hoy" && totalHoy !== null && totalHoy > 0 && (
                <span className="min-w-5 rounded-full bg-surface-dark px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-surface">
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

      <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
        {errorCarga && viajes.length === 0 ? (
          <ErrorState titulo="No pudimos cargar los viajes" descripcion={errorCarga} onReintentar={() => router.refresh()} />
        ) : (
          <>
            <ListaResponsive
              items={visibles}
              clave={(v) => v.id}
              etiqueta="Viajes"
              vacio={
                <Table>
                  <TableBody>{filaVacia()}</TableBody>
                </Table>
              }
              tabla={(items) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ruta</TableHead>
                      <TableHead>Salida</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="hidden 2xl:table-cell">Llegada estimada</TableHead>
                      <TableHead className="text-right">Asientos libres</TableHead>
                      <TableHead className="hidden text-right xl:table-cell">Precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((viaje) => (
                      <TableRow key={viaje.id} className={cn("relative", viaje.estado === "CANCELADO" && "text-muted-foreground")}>
                        <CeldaEnlace
                          onAbrir={() => abrirViaje(viaje.id)}
                          etiqueta={`Ver viaje ${rutaViaje(viaje)} del ${salidaLarga(viaje.fecha_hora_salida)}`}
                        >
                          {rutaViaje(viaje)}
                        </CeldaEnlace>
                        <TableCell className="tabular-nums">{formatFechaHoraCortaVE(viaje.fecha_hora_salida)}</TableCell>
                        <TableCell className="min-w-44">
                          {viaje.estado === "PROGRAMADO" ? (
                            <SelectorUnidad
                              viaje={viaje}
                              viajes={viajes}
                              busesActivos={busesActivos}
                              errorBuses={errorBuses}
                              onElegir={pedirCambioUnidad}
                            />
                          ) : viaje.numero_unidad ? (
                            viaje.numero_unidad
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
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
                            <span className="text-[13px] text-muted-foreground">Sin precio</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={viaje.estado} dominio="viaje" />
                            {viaje.fuera_de_horario && viaje.estado === "PROGRAMADO" && (
                              <TonoBadge tono="pendiente">Fuera de horario</TonoBadge>
                            )}
                          </div>
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
              )}
              tarjeta={(viaje) => {
                const libres = Number(viaje.asientos_disponibles);
                return (
                  <EntityCard
                    onClick={() => abrirViaje(viaje.id)}
                    etiqueta={`Ver viaje ${rutaViaje(viaje)} del ${salidaLarga(viaje.fecha_hora_salida)}`}
                    leading={<IconTile icon={ICONO_SECCION.viajes} tone={TONO_VIAJE[viaje.estado] ?? "sky"} />}
                    title={rutaViaje(viaje)}
                    subtitle={[
                      salidaLarga(viaje.fecha_hora_salida),
                      viaje.estado !== "PROGRAMADO" && viaje.numero_unidad ? `Unidad ${viaje.numero_unidad}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    lineasSubtitulo={2}
                    adorno={
                      <span className="tabular-nums">
                        {libres}
                        <span className="text-[13px] font-normal text-muted-foreground"> / {viaje.asientos_totales}</span>
                      </span>
                    }
                    badge={
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={viaje.estado} dominio="viaje" />
                        {viaje.fuera_de_horario && viaje.estado === "PROGRAMADO" && (
                          <TonoBadge tono="pendiente">Fuera de horario</TonoBadge>
                        )}
                      </span>
                    }
                    meta={
                      Number(viaje.ruta?.precio_pasaje) > 0 ? formatUsd(Number(viaje.ruta.precio_pasaje)) : "Sin precio"
                    }
                    acciones={
                      viaje.estado === "PROGRAMADO" ? (
                        <SelectorUnidad
                          viaje={viaje}
                          viajes={viajes}
                          busesActivos={busesActivos}
                          errorBuses={errorBuses}
                          onElegir={pedirCambioUnidad}
                        />
                      ) : undefined
                    }
                    className={cn(viaje.estado === "CANCELADO" && "opacity-70")}
                  />
                );
              }}
            />
            <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
          </>
        )}
      </Card>
      {historialRecortado && (
        <p className="text-[13px] text-muted-foreground">Últimos 100 viajes. Para uno más antiguo, elige su día de salida.</p>
      )}

      <EditarViajeDialog
        viaje={viajeEditar}
        busesActivos={busesActivos}
        errorBuses={errorBuses}
        open={editarOpen}
        onOpenChange={(abierto) => {
          setEditarOpen(abierto);
          if (!abierto) setRecargaHoja((n) => n + 1);
        }}
      />

      <ViajeSheet
        enViajes
        viajeId={viajeAbierto || null}
        onOpenChange={(abierto) => !abierto && abrirViaje(null)}
        onCambio={() => router.refresh()}
        onEditar={isAdmin ? abrirEditar : undefined}
        onCancelar={isAdmin ? (v) => void abrirCancelar(v) : undefined}
        cancelando={revisandoId !== null && revisandoId === viajeAbierto}
        recarga={recargaHoja}
      />

      <ConfirmDialog
        open={unidadOpen && cambioUnidad !== null}
        onOpenChange={setUnidadOpen}
        titulo={
          cambioUnidad
            ? cambioUnidad.busId
              ? `¿Asignar la unidad ${busesActivos.find((b) => b.id === cambioUnidad.busId)?.numero_unidad ?? ""} a la salida ${rutaViaje(cambioUnidad.viaje)} del ${textoSalida(cambioUnidad.viaje.fecha_hora_salida)}?`
              : `¿Dejar la salida ${rutaViaje(cambioUnidad.viaje)} del ${textoSalida(cambioUnidad.viaje.fecha_hora_salida)} sin unidad?`
            : "¿Cambiar la unidad?"
        }
        verbo={cambioUnidad?.busId ? "Asignar unidad" : "Dejar sin unidad"}
        verboCargando="Guardando…"
        onConfirm={confirmarUnidad}
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
