"use client";

// ─── Venta de boletos en taquilla (página) ───────────────────────────────────
// `/cooperativas/taquilla/boletos/vender`. El mismo asistente que la app
// (`boletos/buscar`), en voz del operador: 1 Elige la salida · 2 Elige los asientos ·
// 3 ¿Quién viaja? · 4 ¿Cómo pagó? y, al terminar, "Boletos emitidos" (sin número).
//
// · El paso vive en la URL (`?paso=`, `usePasoEnUrl`): atrás del navegador = paso anterior.
//   Recargar conserva el paso solo si el estado necesario se puede reconstruir (la salida
//   viaja en `?viaje=`); asientos y pasajeros viven en memoria, así que una recarga en
//   "¿Quién viaja?" o "¿Cómo pagó?" vuelve a "Elige los asientos" (o a la salida).
// · El estado (salida, asientos, pasajeros, resultado) está en un reducer (`use-venta.ts`).
// · `?viaje=<id>` preselecciona la salida y salta al paso 2 (desde Embarque, con
//   `?volver=embarque` para regresar a él).
// · Una clave de idempotencia por venta (se renueva en "Vender otro"): reintentar no duplica.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvisoError } from "@/components/aviso-error";
import { BarraFlujo, FlujoPagina, usePasoEnUrl, useSalidaProtegida } from "@/components/flujo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { useUser } from "@/hooks/use-user";
import { formatHoraVE } from "@/lib/fechas";
import { venderBoletos, type DatosPagoTaquilla } from "../../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { BoletosEmitidos } from "./boletos-emitidos";
import { CobroTaquillaForm, ID_FORM_COBRO, errorDeCobro } from "./cobro-taquilla-form";
import { PasoAsientos } from "./paso-asientos";
import { ID_FORM_PASAJEROS, PasoPasajeros } from "./paso-pasajeros";
import { PasoSalida } from "./paso-salida";
import { TotalCorto } from "./total-corto";
import {
  PASAJERO_VACIO,
  PASOS_VENTA,
  TITULOS_PASO,
  destinoVolver,
  etiquetaAsientos,
  etiquetaRuta,
  formatSalidaVenta,
  mensajeAsientosTomados,
  mensajeExcepcion,
  pasajeroParaGuardar,
  textoAsientos,
  type PasoVenta,
} from "./tipos";
import { useAsientosOcupados } from "./use-asientos-ocupados";
import { useSalidas } from "./use-salidas";
import { useVenta } from "./use-venta";

/** Deja la salida elegida en `?viaje=` (para que recargar la conserve) sin añadir una entrada al historial. */
function fijarViajeEnUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("viaje", id);
  else url.searchParams.delete("viaje");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function VentaPagina({
  viajeIdInicial,
  volver,
}: {
  /** `?viaje=` (viene de Embarque). */
  viajeIdInicial: string | null;
  /** `?volver=` ("embarque" o nada). */
  volver: string | null;
}) {
  const router = useRouter();
  const { user } = useUser();
  const tasa = useTasaBCV();
  const { estado, dispatch, totalUsd, pasajerosValidos, hayDatos } = useVenta();
  const { viaje, marcado, asientos, pasajeros, aviso, operacion, enviando, errorCobro, idemKey } = estado;
  /** La salida pedida por `?viaje=` aún se está resolviendo: los pasos 2+ de la URL siguen siendo válidos. */
  const [inicialPendiente, setInicialPendiente] = useState(Boolean(viajeIdInicial));
  const [etiquetaCobro, setEtiquetaCobro] = useState("Cobrar");
  const enviandoRef = useRef(false);

  const url = usePasoEnUrl<PasoVenta>(PASOS_VENTA, {
    esAccesible: (p) => {
      if (p === "salida") return true;
      if (p === "asientos") return viaje !== null || inicialPendiente;
      if (p === "pasajeros") return viaje !== null && asientos.length > 0;
      return viaje !== null && asientos.length > 0 && pasajerosValidos;
    },
  });
  const paso = url.paso;

  const salidas = useSalidas({
    cooperativaId: user.cooperativa_id,
    viajeIdInicial,
    cargar: paso === "salida",
    onInicial: (inicial) => {
      setInicialPendiente(false);
      if (inicial) {
        dispatch({ tipo: "ELEGIR_VIAJE", viaje: inicial });
        url.ir("asientos");
      } else {
        dispatch({ tipo: "AVISO", aviso: { texto: "Esa salida ya no está a la venta. Elige otra.", paso: "salida" } });
      }
    },
  });

  const ocupadosViaje = useAsientosOcupados(viaje?.id ?? null, paso === "asientos");

  const { dialogo, confirmarSalida } = useSalidaProtegida({ activo: hayDatos && !operacion, bloqueado: enviando });

  const destino = () => destinoVolver(volver, viaje?.id ?? viajeIdInicial);
  const salir = () => confirmarSalida(() => router.push(destino()));

  // ─── Acciones de cada paso ─────────────────────────────────────────────────

  const viajeEnLista = salidas.viajes.find((v) => v.id === marcado) ?? null;

  const continuarSalida = () => {
    if (!viajeEnLista) return;
    dispatch({ tipo: "ELEGIR_VIAJE", viaje: viajeEnLista });
    fijarViajeEnUrl(viajeEnLista.id);
    url.siguiente();
  };

  const continuarAsientos = () => {
    if (asientos.length === 0 || ocupadosViaje.ocupados === null) return;
    dispatch({ tipo: "AVISO", aviso: null });
    url.siguiente();
  };

  const continuarPasajeros = () => {
    if (!pasajerosValidos) {
      dispatch({ tipo: "INTENTAR_PASAJEROS" });
      return;
    }
    dispatch({ tipo: "ERROR_COBRO", error: null });
    url.siguiente();
  };

  const cobrar = async (datos: DatosPagoTaquilla) => {
    if (!viaje || asientos.length === 0 || enviandoRef.current) return;
    enviandoRef.current = true;
    dispatch({ tipo: "ENVIANDO", enviando: true });
    try {
      const resultado = await requireOnline(() =>
        venderBoletos({
          viajeId: viaje.id,
          pasajeros: asientos.map((a) => pasajeroParaGuardar(a, pasajeros[a] ?? PASAJERO_VACIO)),
          ...datos,
          idemKey,
        })
      )();

      if (resultado.success) {
        dispatch({ tipo: "EXITO", operacion: resultado.data });
        // La lista de taquilla (y Embarque) deben ver los boletos nuevos.
        router.refresh();
        return;
      }

      if (resultado.codigo === "EB_ASIENTO_OCUPADO") {
        // Otra venta se llevó asientos: se quitan, se avisa y se vuelve al mapa.
        const tomados = (resultado.detalle?.asientos ?? []).map(String);
        if (tomados.length > 0) dispatch({ tipo: "QUITAR_ASIENTOS", asientos: tomados });
        dispatch({ tipo: "AVISO", aviso: { texto: resultado.error, paso: "asientos" } });
        url.ir("asientos", { reemplazar: true });
      } else if (resultado.codigo === "EB_VIAJE_NO_DISPONIBLE" || resultado.codigo === "EB_NO_ENCONTRADO") {
        fijarViajeEnUrl(null);
        dispatch({ tipo: "VIAJE_PERDIDO", aviso: resultado.error });
        url.ir("salida", { reemplazar: true });
      } else if (resultado.codigo === "EB_DATOS_INVALIDOS" && /pasajero|cédula|nombre/i.test(resultado.error)) {
        dispatch({ tipo: "INTENTAR_PASAJEROS" });
        dispatch({ tipo: "AVISO", aviso: { texto: resultado.error, paso: "pasajeros" } });
        url.ir("pasajeros", { reemplazar: true });
      } else {
        dispatch({ tipo: "ERROR_COBRO", error: errorDeCobro(resultado) ?? { campo: null, mensaje: resultado.error } });
      }
    } catch (err) {
      dispatch({ tipo: "ERROR_COBRO", error: { campo: null, mensaje: mensajeExcepcion(err, "vender los boletos") } });
    } finally {
      enviandoRef.current = false;
      dispatch({ tipo: "ENVIANDO", enviando: false });
    }
  };

  /** "Vender otro": todo en blanco y clave nueva; el día y la ruta se conservan (viven en `useSalidas`). */
  const venderOtro = () => {
    fijarViajeEnUrl(null);
    dispatch({ tipo: "REINICIAR" });
    // Con la venta en blanco el paso de la URL deja de ser accesible y `usePasoEnUrl` vuelve al primero.
  };

  const listo = () => router.replace(destino());

  // ─── Fase final ────────────────────────────────────────────────────────────

  if (operacion) {
    return (
      <>
        {dialogo}
        <BoletosEmitidos
          operacion={operacion}
          trayecto={viaje ? { origen: viaje.ruta.ciudad_origen, destino: viaje.ruta.ciudad_destino } : null}
          unidad={viaje?.numero_unidad}
          onListo={listo}
          onVenderOtro={venderOtro}
        />
      </>
    );
  }

  // ─── Pasos ─────────────────────────────────────────────────────────────────

  const precioViaje = viaje ? Number(viaje.ruta.precio_pasaje) : 0;
  const resumenAsientos =
    asientos.length > 0 && viaje ? (
      <span className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium text-foreground">{etiquetaAsientos(asientos)}</span>
        <span aria-hidden>·</span>
        <TotalCorto usd={precioViaje * asientos.length} />
      </span>
    ) : undefined;

  let barra: React.ReactNode = null;
  if (paso === "salida") {
    // Sin salidas (o con error) no hay nada que continuar: la barra no estorba.
    if (salidas.cargando || (!salidas.error && salidas.viajes.length > 0)) {
      barra = (
        <BarraFlujo
          resumen={
            viajeEnLista ? (
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium text-foreground tabular-nums">
                  {formatHoraVE(viajeEnLista.fecha_hora_salida)} · {etiquetaRuta(viajeEnLista.ruta)}
                </span>
                <span aria-hidden>·</span>
                <TotalCorto usd={Number(viajeEnLista.ruta.precio_pasaje)} />
                <span>por pasaje</span>
              </span>
            ) : (
              "Elige la salida del pasajero."
            )
          }
          principal={{ etiqueta: "Continuar", onClick: continuarSalida, deshabilitado: !viajeEnLista }}
        />
      );
    }
  } else if (paso === "asientos" && viaje) {
    barra = (
      <BarraFlujo
        resumen={resumenAsientos ?? "Toca los asientos que quiere el pasajero."}
        principal={{
          etiqueta: "Continuar",
          onClick: continuarAsientos,
          deshabilitado: asientos.length === 0 || ocupadosViaje.ocupados === null,
        }}
      />
    );
  } else if (paso === "pasajeros" && viaje) {
    barra = (
      <BarraFlujo
        resumen={resumenAsientos}
        principal={{ etiqueta: "Continuar", type: "submit", form: ID_FORM_PASAJEROS }}
      />
    );
  } else if (paso === "pago" && viaje) {
    barra = (
      <BarraFlujo
        resumen={<span className="font-medium text-foreground">{textoAsientos(asientos)}</span>}
        principal={{
          etiqueta: etiquetaCobro,
          type: "submit",
          form: ID_FORM_COBRO,
          cargando: enviando,
          etiquetaCargando: "Cobrando…",
          deshabilitado: !tasa,
        }}
      />
    );
  }

  return (
    <>
      {dialogo}
      <FlujoPagina
        titulo={TITULOS_PASO[paso]}
        paso={url.numero}
        total={url.total}
        onAtras={() => {
          if (enviando) return;
          if (url.indice > 0) url.anterior();
          else salir();
        }}
        atrasEtiqueta={url.indice > 0 ? "Volver al paso anterior" : "Salir de la venta"}
        descripcion={
          viaje && paso !== "salida"
            ? `${etiquetaRuta(viaje.ruta)} · ${formatSalidaVenta(viaje.fecha_hora_salida)}`
            : undefined
        }
        barra={barra}
      >
        {aviso && aviso.paso === paso && <AvisoError>{aviso.texto}</AvisoError>}

        {paso === "salida" && (
          <PasoSalida
            salidas={salidas}
            marcado={marcado}
            onMarcar={(id) => dispatch({ tipo: "MARCAR", id })}
          />
        )}

        {paso === "asientos" &&
          (viaje ? (
            <PasoAsientos
              totalAsientos={viaje.asientos_totales}
              ocupados={ocupadosViaje.ocupados}
              error={ocupadosViaje.error}
              onReintentar={ocupadosViaje.recargar}
              seleccion={asientos}
              onChange={(lista) => dispatch({ tipo: "SET_ASIENTOS", asientos: lista })}
              onTomados={(tomados) => {
                dispatch({ tipo: "QUITAR_ASIENTOS", asientos: tomados });
                dispatch({ tipo: "AVISO", aviso: { texto: mensajeAsientosTomados(tomados), paso: "asientos" } });
              }}
              bloqueado={enviando}
            />
          ) : (
            <div className="flex flex-col items-center gap-4" role="status" aria-label="Cargando la salida">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-96 w-full max-w-sm rounded-xl" />
            </div>
          ))}

        {paso === "pasajeros" && viaje && (
          <PasoPasajeros
            asientos={asientos}
            pasajeros={pasajeros}
            intento={estado.intentoPasajeros}
            focoToken={estado.focoPasajeros}
            onEditar={(asiento, campo, valor) => dispatch({ tipo: "EDITAR_PASAJERO", asiento, campo, valor })}
            onEnviar={continuarPasajeros}
            bloqueado={enviando}
          />
        )}

        {paso === "pago" && viaje && (
          <CobroTaquillaForm
            totalUsd={totalUsd}
            enviando={enviando}
            errorCampo={errorCobro}
            onCobrar={(datos) => void cobrar(datos)}
            onEtiqueta={setEtiquetaCobro}
          />
        )}
      </FlujoPagina>
    </>
  );
}

