"use client";

// ─── Embarque de pasajeros ──────────────────────────────────────────────────
// Pantalla de la puerta del bus (a menudo en teléfono o tablet), separada de la
// taquilla: puede manejarla otra persona.
// 1. ¿Qué bus estás embarcando? (`?viaje=`; por defecto el próximo de hoy) con
//    el contador "X de Y embarcados".
// 2. Escanear: cámara o lector/teclado → `validarEmbarque` → diálogo con el
//    veredicto grande (verde puede embarcar, rojo no) → `confirmarEmbarque`.
//    El panel "Último escaneo" suena según el resultado (lib/sonido).
// 3. Pasajeros del bus con su estado de embarque (`?ver=`).
// Desde el resultado se puede cobrar una reserva, verificar el pago o vender un
// boleto nuevo (los mismos diálogos de la Taquilla de boletos).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, Camera } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { ScanInput } from "@/components/scan-input";
import { CameraQRScanner } from "@/components/camera-qr-scanner";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { ViajeSheet } from "@/components/viajes/viaje-sheet";
import { VentaFlow, CobrarReservaDialog } from "@/components/boletos/venta-flow";
import {
  ResultadoEmbarqueDialog,
  asientoYPasajero,
  escaneoDeResultado,
  etiquetaViaje,
  rutaDeViaje,
  type Escaneo,
  type ViajeHoy,
} from "@/components/embarque/resultado-embarque-dialog";
import {
  ESTADOS_PASAJERO_EMBARQUE,
  PasajerosEmbarque,
  SELECT_PASAJEROS_EMBARQUE,
  conteoEmbarque,
  type PasajeroEmbarque,
} from "@/components/embarque/pasajeros-embarque";
import { requireOnline } from "@/components/connectivity-banner";
import { useUser } from "@/hooks/use-user";
import { useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import { avisarError } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatHoraVE, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { formatCodigoBoleto, normalizarCodigoBoleto } from "@/lib/artefactos.generated";
import { confirmarEmbarque, validarEmbarque } from "./actions";

/** `?viaje=todos`: se validan boletos de cualquier bus de hoy. */
const SIN_BUS = "todos";
/** La lista de pasajeros se refresca sola (otra puerta pudo embarcar a alguien). */
const REFRESCO_MS = 30_000;

const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

export default function EmbarquePage() {
  // useSearchParams (?viaje=, ?ver=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-44 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      }
    >
      <Embarque />
    </Suspense>
  );
}

function Embarque() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  // ─── Bus de hoy ───────────────────────────────────────────────────────────
  const [viajeUrl, setViajeUrl] = useParamUrl("viaje");
  const [viajesHoy, setViajesHoy] = useState<ViajeHoy[]>([]);
  const [sugerido, setSugerido] = useState<string | null>(null);
  const [cargandoViajesHoy, setCargandoViajesHoy] = useState(true);
  const [viajesCargados, setViajesCargados] = useState(false);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);

  const fetchViajesHoy = useCallback(async () => {
    setCargandoViajesHoy(true);
    setErrorViajes(null);
    try {
      const { desde, hasta } = rangoDiaVE(hoyVE());
      const { data, error } = await supabase
        .from("viajes")
        .select(
          "id, fecha_hora_salida, numero_unidad, estado, asientos_totales, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)"
        )
        .eq("cooperativa_id", cooperativaId)
        .in("estado", ["PROGRAMADO", "EN_CURSO"])
        .gte("fecha_hora_salida", desde)
        .lte("fecha_hora_salida", hasta)
        .order("fecha_hora_salida", { ascending: true });
      if (error) throw error;
      const lista = (data ?? []) as unknown as ViajeHoy[];
      setViajesHoy(lista);
      // Por defecto, el próximo bus (o uno que salió hace menos de 30 minutos y aún embarca).
      // La sugerencia se fija: al actualizar (o tras "Marcar salida") se conserva mientras
      // siga en la lista; si no, un bus que sale tarde saltaría solo al siguiente.
      setSugerido((actual) => {
        if (actual && lista.some((v) => v.id === actual)) return actual;
        const limite = Date.now() - 30 * 60 * 1000;
        const proximo = lista.find((v) => new Date(v.fecha_hora_salida).getTime() >= limite) ?? lista[lista.length - 1];
        return proximo?.id ?? null;
      });
      setViajesCargados(true);
    } catch (err) {
      setErrorViajes(humanizeError(err, "cargar los viajes de hoy"));
    } finally {
      setCargandoViajesHoy(false);
    }
  }, [supabase, cooperativaId]);

  // El bus de la URL si se embarca hoy; si no, el sugerido.
  const viajeEnUrlHoy = viajesHoy.some((v) => v.id === viajeUrl);
  const viajeEmbarque = viajeUrl === SIN_BUS ? SIN_BUS : viajeEnUrlHoy ? viajeUrl : (sugerido ?? SIN_BUS);
  const viajeElegido = viajesHoy.find((v) => v.id === viajeEmbarque) ?? null;
  const viajeParaValidar = viajeEmbarque === SIN_BUS ? null : viajeEmbarque;
  const viajeUrlNoEsDeHoy = viajesCargados && Boolean(viajeUrl) && viajeUrl !== SIN_BUS && !viajeEnUrlHoy;

  // ─── Pasajeros del bus ────────────────────────────────────────────────────
  const [pasajerosDe, setPasajerosDe] = useState<{ viajeId: string; filas: PasajeroEmbarque[] } | null>(null);
  const [cargandoPasajeros, setCargandoPasajeros] = useState(false);
  const [errorPasajeros, setErrorPasajeros] = useState<string | null>(null);
  // Última carga: una respuesta vieja (otro bus) no pisa la de una carga posterior.
  const cargaRef = useRef(0);

  const fetchPasajeros = useCallback(async () => {
    const carga = ++cargaRef.current;
    if (!viajeParaValidar) {
      setCargandoPasajeros(false);
      setErrorPasajeros(null);
      return;
    }
    setCargandoPasajeros(true);
    setErrorPasajeros(null);
    try {
      const { data, error } = await supabase
        .from("boletos")
        .select(SELECT_PASAJEROS_EMBARQUE)
        .eq("cooperativa_id", cooperativaId)
        .eq("viaje_id", viajeParaValidar)
        .in("estado", ESTADOS_PASAJERO_EMBARQUE);
      if (carga !== cargaRef.current) return;
      if (error) throw error;
      const filas = ((data ?? []) as unknown as PasajeroEmbarque[]).sort(
        (x, y) => (Number(x.asiento) || 0) - (Number(y.asiento) || 0) || x.asiento.localeCompare(y.asiento)
      );
      setPasajerosDe({ viajeId: viajeParaValidar, filas });
    } catch (err) {
      if (carga === cargaRef.current) setErrorPasajeros(humanizeError(err, "cargar los pasajeros"));
    } finally {
      if (carga === cargaRef.current) setCargandoPasajeros(false);
    }
  }, [supabase, cooperativaId, viajeParaValidar]);

  const pasajeros = pasajerosDe && pasajerosDe.viajeId === viajeParaValidar ? pasajerosDe.filas : [];
  const { confirmados, embarcados, porVerificar, sinPagar } = conteoEmbarque(pasajeros);
  const pasajerosListos = pasajerosDe?.viajeId === viajeParaValidar;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void fetchViajesHoy();
  }, [fetchViajesHoy]);

  useEffect(() => {
    void fetchPasajeros();
  }, [fetchPasajeros]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Refresco periódico mientras la pantalla está a la vista.
  useEffect(() => {
    if (!viajeParaValidar) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchPasajeros();
    }, REFRESCO_MS);
    return () => window.clearInterval(id);
  }, [viajeParaValidar, fetchPasajeros]);

  const actualizar = () => {
    void fetchViajesHoy();
    void fetchPasajeros();
  };

  // ─── Escaneo ──────────────────────────────────────────────────────────────
  const [escaneo, setEscaneo] = useState<Escaneo | null>(null);
  const [validando, setValidando] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const { ultimo, registrar } = useUltimoEscaneo();
  const validandoRef = useRef(false);

  // Cobro, venta y hoja del viaje desde el resultado.
  const [reservaACobrar, setReservaACobrar] = useState<string | null>(null);
  const [showVentaFlow, setShowVentaFlow] = useState(false);
  const [ventaViajeInicial, setVentaViajeInicial] = useState<string | null>(null);
  const [viajeSheet, setViajeSheet] = useState<string | null>(null);

  // El React Compiler memoiza: sin useCallback manual.
  const validar = async (codigo: string, viajeId: string | null, esRevalidacion = false) => {
    if (validandoRef.current) return;
    validandoRef.current = true;
    if (esRevalidacion) setRevalidando(true);
    else setValidando(true);
    try {
      const res = await requireOnline(() => validarEmbarque(codigo, viajeId))();
      if (res.success) {
        setEscaneo({ codigo, resultado: res.data });
        if (!esRevalidacion) {
          const resumen = escaneoDeResultado(codigo, res.data);
          if (resumen) registrar(resumen);
        }
      } else if (esRevalidacion) {
        avisarError(res.error);
        setEscaneo(null);
      } else {
        registrar({ codigo: formatCodigoBoleto(codigo), tono: "error", titulo: "No pudimos revisar el boleto", detalle: res.error });
      }
    } catch (err) {
      const mensaje = mensajeExcepcion(err, "revisar el boleto");
      if (esRevalidacion) avisarError(mensaje);
      else registrar({ codigo: formatCodigoBoleto(codigo), tono: "error", titulo: "No pudimos revisar el boleto", detalle: mensaje });
    } finally {
      validandoRef.current = false;
      setValidando(false);
      setRevalidando(false);
    }
  };

  const handleCodigo = (codigo: string) => {
    // Con o sin guiones, espacios, minúsculas o "PASS-": la forma guardada (BOL-7CABE4AD).
    void validar(normalizarCodigoBoleto(codigo), viajeParaValidar);
  };

  const revalidar = () => {
    if (escaneo) void validar(escaneo.codigo, viajeParaValidar, true);
  };

  const handleConfirmarEmbarque = async (boletoId: string) => {
    if (!escaneo || confirmando) return;
    setConfirmando(true);
    try {
      const res = await requireOnline(() => confirmarEmbarque(boletoId, viajeParaValidar))();
      if (res.success) {
        const r = res.data;
        registrar({
          codigo: formatCodigoBoleto("boleto" in r ? r.boleto.codigo_boleto : escaneo.codigo),
          tono: "exito",
          titulo: "Embarcado",
          detalle: "boleto" in r ? asientoYPasajero(r.boleto) : undefined,
        });
        setEscaneo(null);
        void fetchPasajeros();
      } else if (res.resultado) {
        // Dejó de ser válido entre el escaneo y la confirmación: mostrar la causa.
        const resumen = escaneoDeResultado(escaneo.codigo, res.resultado);
        if (resumen) registrar(resumen);
        else avisarError(res.error);
        setEscaneo({ codigo: escaneo.codigo, resultado: res.resultado });
      } else {
        avisarError(res.error);
      }
    } catch (err) {
      avisarError(mensajeExcepcion(err, "confirmar el embarque"));
    } finally {
      setConfirmando(false);
    }
  };

  const abrirVenta = (viajeId: string | null = null) => {
    setVentaViajeInicial(viajeId);
    setShowVentaFlow(true);
  };

  const algunDialogo = showVentaFlow || !!escaneo || !!reservaACobrar || !!viajeSheet || camaraAbierta;
  const sinViajesAun = cargandoViajesHoy && !viajesCargados;
  const escanerBloqueado = algunDialogo || validando || sinViajesAun;
  const porcentaje = confirmados > 0 ? Math.round((embarcados / confirmados) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Embarque" />

      {/* 1. Bus */}
      <Card role="region" aria-labelledby="titulo-bus-embarque" className="gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Label id="titulo-bus-embarque" htmlFor="bus-embarque" className="text-base font-semibold">
            ¿Qué bus estás embarcando?
          </Label>
          <div className="flex gap-2">
            <Select
              value={viajeEmbarque}
              onValueChange={(v) => setViajeUrl(v ?? SIN_BUS)}
              items={{
                [SIN_BUS]: "Cualquier bus de hoy",
                ...Object.fromEntries(viajesHoy.map((v) => [v.id, etiquetaViaje(v)])),
              }}
            >
              <SelectTrigger id="bus-embarque" className="h-12 w-full min-w-0 flex-1 text-base" disabled={sinViajesAun}>
                <SelectValue placeholder="Elige el bus" />
              </SelectTrigger>
              <SelectContent>
                {viajesHoy.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {etiquetaViaje(v)}
                  </SelectItem>
                ))}
                <SelectItem value={SIN_BUS}>Cualquier bus de hoy</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              onClick={actualizar}
              disabled={cargandoViajesHoy}
              aria-label="Actualizar los viajes y los pasajeros"
              title="Actualizar los viajes y los pasajeros"
            >
              {cargandoViajesHoy ? <Spinner size="sm" /> : <ArrowClockwise aria-hidden />}
            </Button>
          </div>
          {errorViajes && (
            <ErrorState compacto titulo="No pudimos cargar los viajes de hoy" descripcion={errorViajes} onReintentar={fetchViajesHoy} />
          )}
          {viajesCargados && !errorViajes && viajesHoy.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay viajes por embarcar hoy.</p>
          )}
          {viajeUrlNoEsDeHoy && (
            <p className="text-sm text-muted-foreground">Ese viaje no se embarca hoy. Elige uno de la lista.</p>
          )}
        </div>

        {viajeElegido ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-lg font-semibold leading-snug">{rutaDeViaje(viajeElegido)}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  Sale {formatHoraVE(viajeElegido.fecha_hora_salida)}
                  {viajeElegido.numero_unidad ? ` · Unidad ${viajeElegido.numero_unidad}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={viajeElegido.estado} dominio="viaje" />
                <Button variant="outline" size="sm" onClick={() => setViajeSheet(viajeElegido.id)}>
                  Ver viaje
                </Button>
              </div>
            </div>

            {errorPasajeros ? (
              // Sin la lista no se sabe cuántos embarcaron: guion, nunca "0 de 0".
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-4xl font-semibold leading-none text-muted-foreground" aria-hidden>
                    —
                  </span>
                  <span className="text-base font-medium">embarcados</span>
                </p>
                <p className="text-sm text-destructive-text" role="alert">
                  No pudimos contar los embarcados. Revisa la conexión y pulsa Actualizar.
                </p>
              </div>
            ) : !pasajerosListos ? (
              <div className="flex flex-col gap-2" role="status" aria-label="Contando los embarcados">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums" aria-live="polite" aria-atomic="true">
                  <span className="text-4xl font-semibold leading-none">{embarcados}</span>
                  <span className="text-xl text-muted-foreground">de {confirmados}</span>
                  <span className="text-base font-medium">embarcados</span>
                </p>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Pasajeros embarcados"
                  aria-valuemin={0}
                  aria-valuemax={confirmados}
                  aria-valuenow={embarcados}
                >
                  <div
                    className="h-full rounded-full bg-success motion-safe:transition-all"
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
                {(porVerificar > 0 || sinPagar > 0) && (
                  <p className="text-sm text-muted-foreground">
                    {[porVerificar > 0 && `${porVerificar} con pago por verificar`, sinPagar > 0 && `${sinPagar} sin pagar`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : viajeEmbarque === SIN_BUS && viajesHoy.length > 0 ? (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            Validas boletos de cualquier bus de hoy. Elige un bus para ver sus pasajeros y cuántos faltan por embarcar.
          </p>
        ) : null}
      </Card>

      {/* 2. Escáner */}
      <section aria-labelledby="titulo-escaner" className="flex flex-col gap-3">
        <h2 id="titulo-escaner" className="sr-only">
          Escanear boletos
        </h2>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex flex-col gap-2">
            {/* En teléfono y tablet la cámara es la forma principal de escanear. */}
            <Button size="lg" className="h-12 w-full text-base lg:hidden" onClick={() => setCamaraAbierta(true)} disabled={escanerBloqueado}>
              <Camera className="size-5" aria-hidden />
              Escanear con la cámara
            </Button>
            <ScanInput onCodigo={handleCodigo} cooperativaId={cooperativaId} mode="boletos" disabled={escanerBloqueado} />
            <div className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
              {validando && (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Revisando el boleto…
                </span>
              )}
            </div>
          </div>
          <UltimoEscaneo resultado={ultimo} />
        </div>
      </section>

      {/* 3. Pasajeros */}
      {viajeParaValidar && (
        <PasajerosEmbarque
          pasajeros={pasajeros}
          cargando={cargandoPasajeros || !pasajerosListos}
          error={errorPasajeros}
          onReintentar={fetchPasajeros}
        />
      )}

      <CameraQRScanner open={camaraAbierta} onOpenChange={setCamaraAbierta} onScan={handleCodigo} />

      {/* Mientras se cobra la reserva escaneada, el resultado se oculta y luego se revalida. */}
      <ResultadoEmbarqueDialog
        escaneo={reservaACobrar ? null : escaneo}
        viajesHoy={viajesHoy}
        viajeElegido={viajeElegido}
        confirmando={confirmando}
        revalidando={revalidando}
        onCerrar={() => setEscaneo(null)}
        onConfirmar={(id) => void handleConfirmarEmbarque(id)}
        onRevalidar={() => {
          revalidar();
          void fetchPasajeros();
        }}
        onCobrar={(id) => setReservaACobrar(id)}
        onVender={(viajeId) => {
          setEscaneo(null);
          abrirVenta(viajeId);
        }}
        onCambiarBus={(viajeId) => {
          setViajeUrl(viajeId);
          if (escaneo) void validar(escaneo.codigo, viajeId, true);
        }}
      />

      <CobrarReservaDialog
        boletoId={reservaACobrar}
        open={!!reservaACobrar}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setReservaACobrar(null);
            // Tras cobrar se vuelve a validar para ofrecer el embarque.
            if (escaneo) revalidar();
          }
        }}
        onCobrado={() => void fetchPasajeros()}
      />

      <VentaFlow
        isOpen={showVentaFlow}
        viajeIdInicial={ventaViajeInicial}
        onClose={() => {
          setShowVentaFlow(false);
          setVentaViajeInicial(null);
          void fetchPasajeros();
        }}
      />

      <ViajeSheet
        viajeId={viajeSheet}
        onOpenChange={(abierto) => !abierto && setViajeSheet(null)}
        onCambio={actualizar}
        desdeEmbarque
      />
    </div>
  );
}
