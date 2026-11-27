"use client";

// ─── Cobrar en taquilla una reserva de la app (página) ───────────────────────
// `/cooperativas/taquilla/boletos/cobrar/[compraId]`: un solo paso, "¿Cómo pagó?"
// (el mismo `CobroTaquillaForm` de la venta), y la fase "Boletos emitidos". Cobra
// toda la compra con `fn_cobrar_reserva_taquilla`; la clave de idempotencia se crea
// al abrir la página, así que reintentar no cobra dos veces.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TotalCorto } from "./total-corto";
import { BarraFlujo, FlujoPagina, useSalidaProtegida } from "@/components/flujo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { avisarError } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { createClient } from "@/lib/supabase/client";
import { cobrarReserva, type DatosPagoTaquilla, type OperacionTaquilla } from "../../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { listaAsientos } from "../seat-selector";
import { BoletosEmitidos } from "./boletos-emitidos";
import { CobroTaquillaForm, ID_FORM_COBRO, errorDeCobro, type ErrorCampoCobro } from "./cobro-taquilla-form";
import { destinoVolver, formatSalidaVenta, mensajeExcepcion, nuevaClave } from "./tipos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReservaParaCobro = {
  /** Boleto de la compra con el que se llama a la RPC (cobra la compra completa). */
  boletoId: string;
  asientos: string[];
  totalUsd: number;
  pasajero: string | null;
  ruta: string;
  trayecto: { origen: string; destino: string } | null;
  salida: string | null;
  unidad: string | null;
  viajeId: string | null;
};

export function CobrarReservaPagina({ compraId, volver }: { compraId: string; volver: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const tasa = useTasaBCV();
  const [reserva, setReserva] = useState<ReservaParaCobro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idemKey] = useState(nuevaClave);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [errorCobro, setErrorCobro] = useState<ErrorCampoCobro | null>(null);
  const [operacion, setOperacion] = useState<OperacionTaquilla | null>(null);
  const [etiquetaCobro, setEtiquetaCobro] = useState("Cobrar");
  const { dialogo, confirmarSalida } = useSalidaProtegida({ activo: false, bloqueado: enviando });

  const destino = destinoVolver(volver, reserva?.viajeId);

  const cargar = useCallback(async () => {
    if (!UUID_RE.test(compraId)) {
      setErrorCarga("No encontramos esa reserva. Vuelve a la lista y ábrela de nuevo.");
      setCargando(false);
      return;
    }
    setCargando(true);
    setErrorCarga(null);
    try {
      const { data, error } = await supabase
        .from("boletos")
        .select(`
          id, asiento, precio, pasajero_nombre,
          viaje:viajes!viaje_id(id, fecha_hora_salida, numero_unidad, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino))
        `)
        .eq("compra_id", compraId)
        .eq("estado", "RESERVADO");
      if (error) throw error;
      const filas = (data ?? []) as unknown as {
        id: string;
        asiento: string;
        precio: number;
        pasajero_nombre: string | null;
        viaje: {
          id: string;
          fecha_hora_salida: string;
          numero_unidad: string | null;
          ruta: { ciudad_origen: string; ciudad_destino: string } | null;
        } | null;
      }[];
      if (filas.length === 0) {
        setReserva(null);
        setErrorCarga("Esta reserva ya no está pendiente de pago. Actualiza la lista.");
        return;
      }
      const v = filas[0].viaje;
      setReserva({
        boletoId: filas[0].id,
        asientos: filas.map((f) => f.asiento).sort((a, b) => Number(a) - Number(b)),
        totalUsd: filas.reduce((suma, f) => suma + Number(f.precio), 0),
        pasajero: filas.find((f) => f.pasajero_nombre)?.pasajero_nombre ?? null,
        ruta: v?.ruta ? `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}` : "",
        trayecto: v?.ruta ? { origen: v.ruta.ciudad_origen, destino: v.ruta.ciudad_destino } : null,
        salida: v?.fecha_hora_salida ?? null,
        unidad: v?.numero_unidad ?? null,
        viajeId: v?.id ?? null,
      });
    } catch (err) {
      setErrorCarga(mensajeExcepcion(err, "cargar la reserva"));
    } finally {
      setCargando(false);
    }
  }, [supabase, compraId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir la página
    void cargar();
  }, [cargar]);

  const cobrar = async (datos: DatosPagoTaquilla) => {
    if (!reserva || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErrorCobro(null);
    try {
      const res = await requireOnline(() => cobrarReserva({ boletoId: reserva.boletoId, ...datos, idemKey }))();
      if (res.success) {
        setOperacion(res.data);
        router.refresh();
        return;
      }
      if (res.codigo === "EB_ESTADO_CAMBIO" || res.codigo === "EB_PAGO_PENDIENTE_EXISTE") {
        // La reserva cambió de estado (otro compañero la cobró o el pasajero reportó un pago):
        // se sale de esta página y el motivo queda en un aviso.
        avisarError(res.error);
        router.refresh();
        router.replace(destino);
        return;
      }
      setErrorCobro(errorDeCobro(res) ?? { campo: null, mensaje: res.error });
    } catch (err) {
      setErrorCobro({ campo: null, mensaje: mensajeExcepcion(err, "cobrar la reserva") });
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  if (operacion) {
    return (
      <BoletosEmitidos
        operacion={operacion}
        trayecto={reserva?.trayecto ?? null}
        unidad={reserva?.unidad}
        onListo={() => router.replace(destino)}
      />
    );
  }

  const cantidad = reserva?.asientos.length ?? 0;
  const descripcion = reserva
    ? [
        `${cantidad === 1 ? "1 boleto" : `${cantidad} boletos`}`,
        reserva.ruta,
        reserva.salida ? formatSalidaVenta(reserva.salida) : null,
        `${cantidad === 1 ? "asiento" : "asientos"} ${listaAsientos(reserva.asientos)}`,
        reserva.pasajero,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Reserva de la app";

  return (
    <>
      {dialogo}
      <FlujoPagina
        titulo="¿Cómo pagó?"
        descripcion={descripcion}
        onAtras={() => confirmarSalida(() => router.push(destino))}
        atrasEtiqueta="Salir del cobro"
        barra={
          reserva ? (
            <BarraFlujo
              resumen={`${cantidad === 1 ? "Asiento" : "Asientos"} ${listaAsientos(reserva.asientos)}${reserva.ruta ? ` · ${reserva.ruta}` : ""}`}
              total={{ valor: <TotalCorto usd={reserva.totalUsd} className="font-[inherit]" /> }}
              principal={{
                etiqueta: etiquetaCobro,
                type: "submit",
                form: ID_FORM_COBRO,
                cargando: enviando,
                etiquetaCargando: "Cobrando…",
                deshabilitado: !tasa,
              }}
            />
          ) : undefined
        }
      >
        {cargando && !reserva ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Cargando la reserva">
            <Skeleton className="h-20 w-full rounded-md" />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        ) : errorCarga && !reserva ? (
          <div className="flex flex-col gap-4">
            <ErrorState compacto titulo="No pudimos cargar la reserva" descripcion={errorCarga} onReintentar={cargar} />
            <Button variant="outline" size="lg" className="self-start" onClick={() => router.push(destino)}>
              Volver
            </Button>
          </div>
        ) : reserva ? (
          <CobroTaquillaForm
            totalUsd={reserva.totalUsd}
            enviando={enviando}
            errorCampo={errorCobro}
            onCobrar={(d) => void cobrar(d)}
            onEtiqueta={setEtiquetaCobro}
          />
        ) : null}
      </FlujoPagina>
    </>
  );
}
