"use client";

// ─── Despacho de encomiendas ────────────────────────────────────────────────
// 1. Elegir el viaje (obligatorio antes de escanear).
// 2. Escanear: el servidor valida cada paquete contra el viaje
//    (fn_validar_encomienda_despacho) y explica por qué no puede ir.
// 3. Confirmar: fn_despachar_encomiendas (todo o nada). El viaje no cambia de
//    estado; la salida del bus se marca con "Marcar salida".
// `?viaje=<id>` y `?fecha=` guardan el viaje elegido (Resumen, hoja del viaje, recarga).

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AvisoError } from "@/components/aviso-error";
import { ConfirmDialog, type ResultadoConfirmacion } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { ScanInput } from "@/components/scan-input";
import { TonoBadge } from "@/components/status-badge";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { Monto } from "@/components/monto";
import { MarcarSalidaDialog } from "@/components/viajes/marcar-viaje-dialogs";
import { requireOnline } from "@/components/connectivity-banner";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { fechaVE, formatFechaVE, formatHoraVE, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { EncomiendaRechazadaDespacho, ResultadoDespacho } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";
import { despacharEncomiendas } from "./actions";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  return formatHoraVE(iso);
}

/** "2:30 p. m. · Unidad 12" */
function detalleViaje(v: ViajeDespacho) {
  return [horaCorta(v.fecha_hora_salida), v.numero_unidad ? `Unidad ${v.numero_unidad}` : "Sin unidad"].join(" · ");
}

function rutaDe(v: ViajeDespacho) {
  return `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}`;
}

function nEncomiendas(n: number) {
  return n === 1 ? "1 encomienda" : `${n} encomiendas`;
}

/** Carga de la página: misma forma que la pantalla (dos columnas, sin spinner). */
function DespachoSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}

export default function DespachoPage() {
  // useSearchParams (?viaje=, ?fecha=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense fallback={<DespachoSkeleton />}>
      <Despacho />
    </Suspense>
  );
}

function Despacho() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const viajeParam = searchParams.get("viaje");
  const cambiarParams = useCambiarParams();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  // Día y viaje elegidos viven en la URL (PN-16): recargar o compartir conserva el viaje.
  const hoy = hoyVE();
  const [fechaUrl, setFechaUrl] = useParamUrl("fecha", hoy);
  const fecha = FECHA_RE.test(fechaUrl) ? fechaUrl : hoy;
  const [viajes, setViajes] = useState<ViajeDespacho[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(true);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);

  const [selectedViaje, setSelectedViaje] = useState<ViajeDespacho | null>(null);
  const [lista, setLista] = useState<ItemDespacho[]>([]);
  const [validando, setValidando] = useState(false);
  const { ultimo, registrar } = useUltimoEscaneo();

  const [cambioPendiente, setCambioPendiente] = useState<ViajeDespacho | null>(null);
  const [confirmarOpen, setConfirmarOpen] = useState(false);
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

  /** Elige el viaje y lo escribe en la URL (`?viaje=`, con su día). */
  const fijarViaje = useCallback(
    (v: ViajeDespacho | null) => {
      setSelectedViaje(v);
      if (!v) {
        cambiarParams({ viaje: null });
        return;
      }
      const dia = fechaVE(v.fecha_hora_salida);
      cambiarParams({ viaje: v.id, fecha: dia === hoyVE() ? null : dia });
    },
    [cambiarParams]
  );

  // ?viaje=<id> que llega desde fuera (Resumen, hoja del viaje, recarga): se carga ese viaje.
  const selectedId = selectedViaje?.id ?? null;
  useEffect(() => {
    if (!viajeParam || viajeParam === selectedId) return;
    if (!UUID_RE.test(viajeParam)) {
      cambiarParams({ viaje: null });
      return;
    }
    let activo = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("viajes")
          .select("id, fecha_hora_salida, numero_unidad, estado, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)")
          .eq("cooperativa_id", cooperativaId)
          .eq("id", viajeParam)
          .maybeSingle();
        if (!activo) return;
        if (error) throw error;
        const v = data as unknown as (ViajeDespacho & { estado: string }) | null;
        if (!v || v.estado !== "PROGRAMADO") {
          avisarInfo("Esa salida ya no está disponible para despachar.");
          cambiarParams({ viaje: null });
          return;
        }
        setLista([]);
        fijarViaje({ id: v.id, fecha_hora_salida: v.fecha_hora_salida, numero_unidad: v.numero_unidad, ruta: v.ruta });
      } catch (err) {
        if (activo) avisarError(humanizeError(err, "abrir el viaje"));
      }
    })();
    return () => {
      activo = false;
    };
  }, [viajeParam, selectedId, supabase, cooperativaId, cambiarParams, fijarViaje]);

  const elegirViaje = (viaje: ViajeDespacho) => {
    if (selectedViaje?.id === viaje.id) return;
    if (lista.length > 0) {
      setCambioPendiente(viaje);
      return;
    }
    fijarViaje(viaje);
  };

  const handleEncomiendaFound = async (encomienda: Encomienda) => {
    const codigo = encomienda.tracking_id;
    if (!selectedViaje) {
      registrar({ codigo, tono: "aviso", titulo: "Primero elige el viaje" });
      return;
    }
    if (lista.some((e) => e.id === encomienda.id)) {
      registrar({ codigo, tono: "aviso", titulo: "Ya está en la lista" });
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
        registrar({ codigo, tono: "error", titulo: "No encontrada", detalle: "Revisa el código e intenta de nuevo." });
        return;
      }
      if (r.resultado !== "OK") {
        registrar({ codigo, tono: "error", titulo: "No puede ir en este viaje", detalle: mensajeResultado(r) });
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
      registrar({
        codigo: e.tracking_id,
        tono: "exito",
        titulo: `Agregada · ${e.tracking_id}`,
        detalle: e.cobro_en_destino ? `${e.receiver_nombre} · paga al retirar` : `${e.receiver_nombre} · ${formatCiudad(e.ciudad_destino)}`,
      });
    } catch (err) {
      registrar({ codigo, tono: "error", titulo: "No pudimos revisarla", detalle: humanizeError(err, "revisar la encomienda") });
    } finally {
      setValidando(false);
    }
  };

  const removerEncomienda = (id: string) => {
    setLista((prev) => prev.filter((e) => e.id !== id));
  };

  const confirmarDespacho = async (): Promise<ResultadoConfirmacion> => {
    if (!selectedViaje || lista.length === 0) return { ok: false, error: "La lista está vacía." };
    try {
      const ids = lista.map((e) => e.id);
      const res = await requireOnline(() => despacharEncomiendas(selectedViaje.id, ids))();
      if (res.success) {
        const n = res.data.despachadas;
        avisarExito(`${n === 1 ? "1 encomienda despachada" : `${n} encomiendas despachadas`} a ${formatCiudad(selectedViaje.ruta.ciudad_destino)}.`);
        setLista([]);
        return { ok: true };
      }
      if (res.codigo === "EB_DESPACHO_INVALIDO" && res.rechazadas?.length) {
        const porId = new Map(res.rechazadas.map((r) => [r.id, motivoRechazo(r)]));
        setLista((prev) => prev.map((e) => ({ ...e, rechazo: porId.get(e.id) })));
      }
      if (res.codigo === "EB_VIAJE_NO_DISPONIBLE") void fetchViajes();
      return { ok: false, error: res.error || humanizeError(null, "despachar las encomiendas") };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "despachar las encomiendas") };
    }
  };

  const n = lista.length;
  const cobroDestino = lista.filter((e) => e.cobro_en_destino).length;
  const hayRechazadas = lista.some((e) => e.rechazo);
  const IconoDespacho = ICONO_SECCION.despacho;
  const IconoEscanear = ICONO_SECCION.escanear;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Despacho" />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Columna izquierda: viajes */}
        <section aria-labelledby="despacho-paso-1" className="flex flex-col gap-4">
          <h2 id="despacho-paso-1" className="flex items-center gap-2 text-lg font-semibold">
            <IconoDespacho className="size-5 text-muted-foreground" aria-hidden />
            1. Elige el viaje
          </h2>
          <Card className="gap-4 p-4">
            <div className="flex flex-col gap-2 sm:w-56">
              <Label htmlFor="despacho-fecha-viaje">Fecha del viaje</Label>
              <Input
                id="despacho-fecha-viaje"
                type="date"
                className="tabular-nums"
                value={fecha}
                onChange={(e) => setFechaUrl(e.target.value || null)}
              />
            </div>

            {loadingViajes ? (
              <div className="flex flex-col gap-2" role="status" aria-label="Cargando los viajes">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : errorViajes ? (
              <ErrorState compacto titulo="No pudimos cargar los viajes" descripcion={errorViajes} onReintentar={fetchViajes} />
            ) : viajes.length === 0 ? (
              <EmptyState compacto icon={ICONO_SECCION.viajes} title="No hay viajes programados este día" />
            ) : (
              <GrupoOpciones etiqueta="Viaje" className="flex flex-col gap-2">
                {viajes.map((viaje) => (
                  <OpcionTile
                    key={viaje.id}
                    seleccionado={selectedViaje?.id === viaje.id}
                    onSelect={() => elegirViaje(viaje)}
                    titulo={<span className="text-base">{rutaDe(viaje)}</span>}
                    detalle={<span className="tabular-nums">{detalleViaje(viaje)}</span>}
                  />
                ))}
              </GrupoOpciones>
            )}
          </Card>
        </section>

        {/* Columna derecha: encomiendas */}
        <section aria-labelledby="despacho-paso-2" className="flex flex-col gap-4">
          <h2
            id="despacho-paso-2"
            className={cn("flex items-center gap-2 text-lg font-semibold", !selectedViaje && "text-muted-foreground")}
          >
            <IconoEscanear className="size-5 text-muted-foreground" aria-hidden />
            2. Escanea los paquetes
          </h2>

          {!selectedViaje ? (
            <Card className="py-0">
              <EmptyState compacto icon={IconoEscanear} title="Primero elige el viaje" />
            </Card>
          ) : (
            <>
              <Card className="flex-row flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold">{rutaDe(selectedViaje)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatFechaVE(selectedViaje.fecha_hora_salida)} · {detalleViaje(selectedViaje)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalidaOpen(true)}
                  disabled={n > 0}
                  title={n > 0 ? "Despacha o vacía la lista antes de marcar la salida." : undefined}
                >
                  <ICONO_SECCION.unidad aria-hidden />
                  Marcar salida
                </Button>
              </Card>

              <ScanInput
                onEncomiendaFound={(e) => void handleEncomiendaFound(e)}
                onError={(err) => registrar({ codigo: err.codigo, tono: "error", titulo: "No encontrada", detalle: err.mensaje })}
                cooperativaId={cooperativaId}
                mode="encomiendas"
                disabled={validando || confirmarOpen || cambioPendiente !== null || salidaOpen}
              />

              <UltimoEscaneo resultado={ultimo} />

              <Card className="gap-0 p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h3 className="text-base font-semibold">Lista de despacho</h3>
                  <div className="flex flex-wrap gap-2">
                    {cobroDestino > 0 && <TonoBadge tono="neutro">{cobroDestino} pagan al retirar</TonoBadge>}
                    <Badge variant="secondary" className="tabular-nums">
                      {n === 1 ? "1 paquete" : `${n} paquetes`}
                    </Badge>
                  </div>
                </div>
                {n === 0 ? (
                  <EmptyState compacto icon={ICONO_SECCION.taquillaEncomiendas} title="Escanea una encomienda para agregarla" />
                ) : (
                  <ul className="divide-y divide-border">
                    {lista.map((enc) => (
                      <li
                        key={enc.id}
                        className={cn("flex items-center justify-between gap-3 px-4 py-3", enc.rechazo && "bg-destructive-light/60")}
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm text-foreground">{enc.tracking_id}</span>
                            {enc.cobro_en_destino && <TonoBadge tono="neutro">{MODALIDAD_PAGO.DESTINO.corto}</TonoBadge>}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {enc.receiver_nombre} · {formatCiudad(enc.ciudad_destino)}
                            {enc.peso_kg ? ` · ${String(enc.peso_kg).replace(".", ",")} kg` : ""}
                          </p>
                          {enc.cobro_en_destino && enc.costo_usd != null && <Monto usd={Number(enc.costo_usd)} size="sm" />}
                          {enc.rechazo && <p className="text-sm font-medium text-destructive-text">{enc.rechazo}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removerEncomienda(enc.id)}
                          aria-label={`Quitar ${enc.tracking_id} de la lista`}
                          className="shrink-0"
                        >
                          <X aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {hayRechazadas && <AvisoError>Quita las encomiendas marcadas para poder despachar.</AvisoError>}

              <Button size="lg" className="w-full" onClick={() => setConfirmarOpen(true)} disabled={n === 0 || hayRechazadas}>
                Despachar {nEncomiendas(n)}
              </Button>
            </>
          )}
        </section>
      </div>

      {/* Confirmar despacho */}
      <ConfirmDialog
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        titulo={`¿Despachar ${nEncomiendas(n)}?`}
        descripcion={
          selectedViaje
            ? `${rutaDe(selectedViaje)} · ${horaCorta(selectedViaje.fecha_hora_salida)}${
                selectedViaje.numero_unidad ? ` · Unidad ${selectedViaje.numero_unidad}` : ""
              }`
            : undefined
        }
        impacto={[
          "Pasan a «En tránsito»: no se puede deshacer.",
          ...(cobroDestino > 0 ? [`${cobroDestino === 1 ? "1 se cobra" : `${cobroDestino} se cobran`} al retirar en destino.`] : []),
          "La venta de boletos de esta salida sigue abierta.",
        ]}
        verbo={`Despachar ${nEncomiendas(n)}`}
        verboCargando="Despachando…"
        onConfirm={confirmarDespacho}
      />

      {/* Cambiar de viaje con la lista llena */}
      <ConfirmDialog
        open={cambioPendiente !== null}
        onOpenChange={(abierto) => !abierto && setCambioPendiente(null)}
        tono="destructive"
        titulo="¿Cambiar de viaje?"
        descripcion={`La lista de ${nEncomiendas(n)} se vacía y tendrás que escanearlas de nuevo.`}
        verbo="Cambiar de viaje"
        onConfirm={async () => {
          if (cambioPendiente) {
            setLista([]);
            fijarViaje(cambioPendiente);
          }
          setCambioPendiente(null);
          return { ok: true };
        }}
      />

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
          fijarViaje(null);
          setLista([]);
          void fetchViajes();
        }}
      />
    </div>
  );
}
