"use client";

// ─── Despacho de encomiendas ────────────────────────────────────────────────
// 1. Elegir el viaje (obligatorio antes de escanear).
// 2. Escanear: el servidor valida cada paquete contra el viaje
//    (fn_validar_encomienda_despacho) y explica por qué no puede ir.
// 3. Confirmar: fn_despachar_encomiendas (todo o nada). El viaje no cambia de
//    estado; la salida del bus se marca con "Marcar salida".

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanInput } from "@/components/scan-input";
import { Monto } from "@/components/monto";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { despacharEncomiendas } from "./actions";
import { MarcarSalidaDialog } from "../viajes/client";
import { formatCiudad } from "@/lib/ciudades";
import { MapPin, Clock, Truck, Package, X, Bus, WarningCircle } from "@phosphor-icons/react";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { EncomiendaRechazadaDespacho, ResultadoDespacho } from "@/lib/types/pagos";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { ErrorState } from "@/components/error-state";
import { hoyVE, rangoDiaVE, formatHoraVE, formatFechaVE } from "@/lib/fechas";

interface ViajeDespacho {
  id: string;
  fecha_hora_salida: string;
  numero_unidad: string | null;
  ruta: {
    ciudad_origen: string;
    ciudad_destino: string;
  };
}

type ItemDespacho = {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  ciudad_destino: string;
  peso_kg: number | null;
  costo_usd: number | null;
  cobro_en_destino: boolean;
  /** Motivo por el que el servidor no la dejó despachar (EB_DESPACHO_INVALIDO). */
  rechazo?: string;
};

/** Por qué una encomienda escaneada no puede ir en este viaje. */
function mensajeResultado(r: Exclude<ResultadoDespacho, { resultado: "NO_ENCONTRADA" }>): string {
  const t = r.encomienda.tracking_id;
  switch (r.resultado) {
    case "OTRO_DESTINO":
      return `La encomienda ${t} va a ${formatCiudad(r.encomienda.ciudad_destino)}; este viaje va a ${formatCiudad(r.viaje.destino)}. No la cargues en este bus.`;
    case "OTRO_ORIGEN":
      return `La encomienda ${t} sale de ${formatCiudad(r.encomienda.ciudad_origen)}; este viaje sale de ${formatCiudad(r.viaje.origen)}. No la cargues en este bus.`;
    case "POR_PAGAR":
      return `La encomienda ${t} está por pagar. Cóbrala en la Taquilla de encomiendas antes de despacharla.`;
    case "SIN_RECIBIR":
      return `La encomienda ${t} todavía no se recibió en taquilla. Recíbela y pésala antes de despacharla.`;
    case "YA_DESPACHADA":
      return `La encomienda ${t} ya salió en otro viaje.`;
    case "CERRADA":
      return `La encomienda ${t} está cancelada o devuelta. No la cargues.`;
    default:
      return "No encontramos esa encomienda en tu cooperativa. Revisa el código e intenta de nuevo.";
  }
}

/** Motivo corto para marcar una encomienda rechazada en la lista. */
function motivoRechazo(r: EncomiendaRechazadaDespacho): string {
  switch (r.resultado) {
    case "OTRO_DESTINO":
      return `Va a ${formatCiudad(r.ciudad_destino)}: no es el destino de este viaje. Quítala.`;
    case "OTRO_ORIGEN":
      return "Sale de otra ciudad: no puede ir en este viaje. Quítala.";
    case "POR_PAGAR":
      return "Está por pagar: cóbrala en la Taquilla de encomiendas antes.";
    case "SIN_RECIBIR":
      return "Todavía no se recibió en taquilla.";
    case "YA_DESPACHADA":
      return "Ya salió en otro viaje. Quítala.";
    case "CERRADA":
      return "Está cancelada o devuelta. Quítala.";
    default:
      return "No se encontró en tu cooperativa. Quítala.";
  }
}

function horaCorta(iso: string) {
  return formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export default function DespachoPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [fecha, setFecha] = useState(() => hoyVE());
  const [viajes, setViajes] = useState<ViajeDespacho[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(false);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);

  const [selectedViaje, setSelectedViaje] = useState<ViajeDespacho | null>(null);
  const [lista, setLista] = useState<ItemDespacho[]>([]);
  const [validando, setValidando] = useState(false);
  const [ultimoRechazo, setUltimoRechazo] = useState<string | null>(null);

  const [cambioPendiente, setCambioPendiente] = useState<ViajeDespacho | null>(null);
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [salidaOpen, setSalidaOpen] = useState(false);

  const fetchViajes = useCallback(async () => {
    if (!cooperativaId || !fecha) return;
    setLoadingViajes(true);
    setErrorViajes(null);
    try {
      // Día completo en hora de Venezuela, sin importar la zona del navegador
      const { desde, hasta } = rangoDiaVE(fecha);
      const { data, error } = await supabase
        .from("viajes")
        .select(`
          id, fecha_hora_salida, numero_unidad,
          ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "PROGRAMADO")
        .gte("fecha_hora_salida", desde)
        .lte("fecha_hora_salida", hasta)
        .order("fecha_hora_salida", { ascending: true });

      if (error) throw error;
      setViajes((data as unknown as ViajeDespacho[]) || []);
    } catch (err) {
      console.error(err);
      setViajes([]);
      setErrorViajes(humanizeError(err, "cargar los viajes"));
    } finally {
      setLoadingViajes(false);
    }
  }, [supabase, cooperativaId, fecha]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchViajes();
  }, [fetchViajes]);

  const elegirViaje = (viaje: ViajeDespacho) => {
    if (selectedViaje?.id === viaje.id) return;
    if (lista.length > 0) {
      setCambioPendiente(viaje);
      return;
    }
    setSelectedViaje(viaje);
    setUltimoRechazo(null);
  };

  const confirmarCambioViaje = () => {
    if (!cambioPendiente) return;
    setSelectedViaje(cambioPendiente);
    setLista([]);
    setUltimoRechazo(null);
    setCambioPendiente(null);
  };

  const handleEncomiendaFound = async (encomienda: Encomienda) => {
    if (!selectedViaje) {
      toast.error("Primero elige el viaje en el que vas a cargar las encomiendas.");
      return;
    }
    if (lista.some((e) => e.id === encomienda.id)) {
      toast.warning(`La encomienda ${encomienda.tracking_id} ya está en la lista.`);
      return;
    }

    setValidando(true);
    try {
      const { data, error } = await supabase.rpc("fn_validar_encomienda_despacho", {
        p_codigo: encomienda.id,
        p_viaje_id: selectedViaje.id,
      });
      if (error) throw error;
      const r = data as ResultadoDespacho;

      if (r.resultado === "NO_ENCONTRADA") {
        const texto = "No encontramos esa encomienda en tu cooperativa. Revisa el código e intenta de nuevo.";
        setUltimoRechazo(texto);
        toast.error(texto);
        return;
      }
      if (r.resultado !== "OK") {
        const texto = mensajeResultado(r);
        setUltimoRechazo(texto);
        toast.error(texto);
        return;
      }

      const e = r.encomienda;
      setLista((prev) =>
        prev.some((x) => x.id === e.id)
          ? prev
          : [
              ...prev,
              {
                id: e.id,
                tracking_id: e.tracking_id,
                receiver_nombre: e.receiver_nombre,
                ciudad_destino: e.ciudad_destino,
                peso_kg: e.peso_kg,
                costo_usd: e.costo_usd,
                cobro_en_destino: e.cobro_en_destino,
              },
            ]
      );
      setUltimoRechazo(null);
      toast.success(
        e.cobro_en_destino
          ? `${e.tracking_id} agregada a la lista (se cobra al retirar en destino).`
          : `${e.tracking_id} agregada a la lista.`
      );
    } catch (err) {
      console.error(err);
      toast.error(humanizeError(err, "revisar la encomienda"));
    } finally {
      setValidando(false);
    }
  };

  const removerEncomienda = (id: string) => {
    setLista((prev) => prev.filter((e) => e.id !== id));
  };

  const handleConfirmarDespacho = async () => {
    if (!selectedViaje || lista.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ids = lista.map((e) => e.id);
      const res = await requireOnline(() => despacharEncomiendas(selectedViaje.id, ids))();
      setConfirmarOpen(false);
      if (res.success) {
        const n = res.data.despachadas;
        const destino = formatCiudad(selectedViaje.ruta.ciudad_destino);
        toast.success(
          `${n === 1 ? "1 encomienda despachada" : `${n} encomiendas despachadas`} en el viaje a ${destino}.`,
          { description: "Cuando el bus salga, márcalo con «Marcar salida»." }
        );
        setLista([]);
        setUltimoRechazo(null);
        return;
      }

      if (res.codigo === "EB_DESPACHO_INVALIDO" && res.rechazadas?.length) {
        const porId = new Map(res.rechazadas.map((r) => [r.id, motivoRechazo(r)]));
        setLista((prev) => prev.map((e) => ({ ...e, rechazo: porId.get(e.id) })));
      }
      if (res.codigo === "EB_VIAJE_NO_DISPONIBLE") {
        void fetchViajes();
      }
      toast.error(res.error || humanizeError(null, "despachar las encomiendas"));
    } catch (err) {
      console.error(err);
      setConfirmarOpen(false);
      toast.error(humanizeError(err, "despachar las encomiendas"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const n = lista.length;
  const cobroDestino = lista.filter((e) => e.cobro_en_destino).length;
  const hayRechazadas = lista.some((e) => e.rechazo);

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        title="Despacho"
        description="Elige el viaje, escanea los paquetes que vas a cargar y confirma el despacho."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: viajes */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary-text" />
            1. Elegir el viaje
          </h2>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="despacho-fecha-viaje" className="text-sm font-medium text-muted-foreground">
                  Fecha del viaje
                </label>
                <Input
                  id="despacho-fecha-viaje"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {loadingViajes ? (
                  <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Spinner size="md" />
                    <p>Cargando viajes...</p>
                  </div>
                ) : errorViajes ? (
                  <ErrorState
                    compacto
                    titulo="No pudimos cargar los viajes"
                    descripcion={errorViajes}
                    onReintentar={fetchViajes}
                  />
                ) : viajes.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground border rounded-lg bg-muted/20">
                    No hay viajes programados para esta fecha.
                  </div>
                ) : (
                  viajes.map((viaje) => {
                    const isSelected = selectedViaje?.id === viaje.id;
                    return (
                      <button
                        type="button"
                        key={viaje.id}
                        onClick={() => elegirViaje(viaje)}
                        aria-pressed={isSelected}
                        className={`w-full text-left p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-lg">
                            {formatCiudad(viaje.ruta.ciudad_origen)} → {formatCiudad(viaje.ruta.ciudad_destino)}
                          </span>
                          {isSelected && <Badge>Seleccionado</Badge>}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatHoraVE(viaje.fecha_hora_salida)}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            Unidad {viaje.numero_unidad || "sin asignar"}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: encomiendas */}
        <div className="space-y-4">
          <h2 className={`text-xl font-semibold flex items-center gap-2 ${!selectedViaje ? "text-muted-foreground" : ""}`}>
            <Package className="w-5 h-5 text-primary-text" />
            2. Escanear paquetes
          </h2>

          {!selectedViaje ? (
            <div className="h-48 border-2 border-dashed rounded-xl flex items-center justify-center text-muted-foreground bg-muted/10 p-6 text-center">
              Primero elige el viaje en el que vas a cargar las encomiendas.
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              <div className="bg-primary/10 text-primary-text px-4 py-3 rounded-lg flex flex-wrap gap-3 justify-between items-center">
                <div>
                  <div className="font-medium">
                    Cargando para: {formatCiudad(selectedViaje.ruta.ciudad_origen)} →{" "}
                    {formatCiudad(selectedViaje.ruta.ciudad_destino)}
                  </div>
                  <div className="text-sm opacity-80">
                    Unidad {selectedViaje.numero_unidad || "sin asignar"} · {formatFechaVE(selectedViaje.fecha_hora_salida)}{" "}
                    {formatHoraVE(selectedViaje.fecha_hora_salida)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalidaOpen(true)}
                  disabled={n > 0 || isSubmitting}
                  title={n > 0 ? "Despacha o vacía la lista antes de marcar la salida." : undefined}
                >
                  <Bus className="h-4 w-4" />
                  Marcar salida
                </Button>
              </div>

              <ScanInput
                onEncomiendaFound={(e) => void handleEncomiendaFound(e)}
                cooperativaId={cooperativaId}
                mode="encomiendas"
                disabled={isSubmitting || validando || confirmarOpen || cambioPendiente !== null}
              />

              {ultimoRechazo && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
                >
                  <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{ultimoRechazo}</span>
                </div>
              )}

              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                    <h3 className="font-medium">Lista de despacho</h3>
                    <div className="flex gap-2">
                      {cobroDestino > 0 && <Badge variant="outline">{cobroDestino} que pagan al retirar</Badge>}
                      <Badge variant="secondary">{n === 1 ? "1 paquete" : `${n} paquetes`}</Badge>
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-4 space-y-2">
                    {n === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        Escanea una encomienda para agregarla a este viaje.
                      </div>
                    ) : (
                      lista.map((enc) => (
                        <div
                          key={enc.id}
                          className={`flex justify-between items-center gap-3 p-3 border rounded-lg bg-card ${enc.rechazo ? "border-destructive/50 bg-destructive/5" : ""}`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-medium text-sm text-primary-text">{enc.tracking_id}</span>
                              {enc.cobro_en_destino && <Badge variant="outline">{MODALIDAD_PAGO.DESTINO.corto}</Badge>}
                            </div>
                            <div className="text-sm text-muted-foreground truncate">
                              {enc.receiver_nombre} · {formatCiudad(enc.ciudad_destino)}
                              {enc.peso_kg ? ` · ${enc.peso_kg} kg` : ""}
                            </div>
                            {enc.cobro_en_destino && enc.costo_usd != null && (
                              <Monto usd={Number(enc.costo_usd)} size="sm" className="mt-1" />
                            )}
                            {enc.rechazo && <p className="mt-1 text-sm font-medium text-destructive-text">{enc.rechazo}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removerEncomienda(enc.id)}
                            aria-label={`Quitar ${enc.tracking_id} de la lista`}
                            className="h-8 w-8 shrink-0 text-destructive-text hover:bg-destructive/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {hayRechazadas && (
                <p className="text-sm text-destructive-text">Quita de la lista las encomiendas marcadas en rojo para poder despachar.</p>
              )}

              <Button
                className="w-full h-12 text-lg"
                onClick={() => setConfirmarOpen(true)}
                disabled={n === 0 || isSubmitting || hayRechazadas}
              >
                {isSubmitting && <Spinner className="mr-2 h-5 w-5" />}
                Despachar {n === 1 ? "1 encomienda" : `${n} encomiendas`}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmar despacho */}
      <AlertDialog open={confirmarOpen} onOpenChange={(abierto) => !isSubmitting && setConfirmarOpen(abierto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Despachar {n === 1 ? "1 encomienda" : `${n} encomiendas`}?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedViaje && (
                <>
                  Viaje {formatCiudad(selectedViaje.ruta.ciudad_origen)} → {formatCiudad(selectedViaje.ruta.ciudad_destino)} ·{" "}
                  {horaCorta(selectedViaje.fecha_hora_salida)}
                  {selectedViaje.numero_unidad ? ` · Unidad ${selectedViaje.numero_unidad}` : ""}.{" "}
                </>
              )}
              {cobroDestino > 0 &&
                `${cobroDestino === 1 ? "1 se cobra" : `${cobroDestino} se cobran`} al retirar en destino. `}
              Pasarán a «En tránsito» y no se puede deshacer. La venta de boletos de esta salida sigue abierta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Revisar lista</AlertDialogCancel>
            <AlertDialogAction autoFocus onClick={() => void handleConfirmarDespacho()} disabled={isSubmitting}>
              {isSubmitting ? "Despachando…" : `Despachar ${n}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cambiar de viaje con la lista llena */}
      <AlertDialog open={cambioPendiente !== null} onOpenChange={(abierto) => !abierto && setCambioPendiente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar de viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes {n === 1 ? "1 encomienda" : `${n} encomiendas`} en la lista para{" "}
              {selectedViaje ? formatCiudad(selectedViaje.ruta.ciudad_destino) : "este viaje"}. Si cambias de viaje, la
              lista se vacía y tendrás que escanearlas de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir con este viaje</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarCambioViaje}>
              Cambiar de viaje
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MarcarSalidaDialog
        viaje={
          selectedViaje
            ? {
                id: selectedViaje.id,
                origen: selectedViaje.ruta.ciudad_origen,
                destino: selectedViaje.ruta.ciudad_destino,
                salida: selectedViaje.fecha_hora_salida,
              }
            : null
        }
        open={salidaOpen}
        onOpenChange={setSalidaOpen}
        onHecho={() => {
          setSelectedViaje(null);
          setLista([]);
          void fetchViajes();
        }}
      />
    </div>
  );
}
