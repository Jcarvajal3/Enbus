"use client";

// ─── Compra de boletos (versión web de la app del pasajero) ──────────────────
// Asientos → Pasajeros → Pago → Listo, con el paso en `?paso=` (atrás del navegador = paso anterior).
// Las reglas viven en la base de datos; aquí solo se orquestan las RPC (por server actions):
//   1. `fn_reservar_asientos`  aparta 30 min con un `compra_id` por intento (guardado por viaje en
//      sessionStorage: recargar no pierde la compra ni duplica la reserva).
//   2. `fn_asignar_pasajeros`  nombre y cédula de quien viaja en cada asiento.
//   3. `fn_checkout_boletos`   reporta el pago, atómico e idempotente (clave estable por intento).
//   4. `fn_liberar_reserva`    al abandonar sin pagar (mejor esfuerzo; si falla, el cron la libera).
// Equivalente de EnBusApp/src/hooks/useCheckoutBoletos.ts y app/boletos/buscar.tsx.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  PASAJERO_VACIO,
  etiquetaAsientos,
  mensajeAsientosTomados,
  pasajeroParaGuardar,
  pasajeroValido,
  type DatosPasajero,
} from "@/components/boletos/venta/tipos";
import { BarraFlujo, FlujoPagina, usePasoEnUrl, useSalidaProtegida, type AccionBarraFlujo } from "@/components/flujo";
import { ArmazonFlujoSitio } from "@/components/pasajero/flujo-sitio";
import { ID_FORM_PAGO_PASAJERO, type EstadoBarraPago } from "@/components/pasajero/pago";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { fechaVE, hoyVE } from "@/lib/fechas";
import type { TasaRef } from "@/lib/dinero";
import type { DatosPagoPasajero, MetodoPagoPasajero } from "@/lib/pasajero/pagos-comun";
import { RUTAS_PASAJERO, urlComprarBoleto, urlIngresar, urlViajes } from "@/lib/pasajero/rutas";
import type { ViajePublico } from "@/lib/pasajero/viajes";
import {
  asignarPasajeros,
  liberarReserva,
  reportarPago,
  reservarAsientos,
  sugerenciasPasajeros,
} from "@/app/(sitio)/comprar/boleto/acciones";
import {
  borrarCompra,
  borrarListo,
  guardarCompra,
  guardarListo,
  leerCompra,
  leerListo,
} from "./almacen";
import type { AvisoFlujo } from "./aviso-compra";
import { CuentaRegresiva } from "./cuenta-regresiva";
import { PasoAsientos } from "./paso-asientos";
import { PasoListo } from "./paso-listo";
import { ID_FORM_PASAJEROS, PasoPasajeros } from "./paso-pasajeros";
import { PasoPago, type TasaCambiada } from "./paso-pago";
import { descripcionViaje, totalEnVivo, totalParaBarra } from "./resumen-viaje";
import { SalidaNoDisponible } from "./salida-no-disponible";
import {
  PASOS_COMPRA,
  PASOS_VISIBLES,
  TITULOS_PASO,
  asientosDelError,
  nuevoId,
  ordenarAsientos,
  type PasoCompra,
  type ResultadoAccion,
  type ResultadoCompra,
  type ResumenCompra,
  type SugerenciaPasajero,
} from "./tipos";
import { useAsientosOcupados } from "./use-asientos-ocupados";
import s from "./compra.module.css";

/** Datos del perfil de quien compra (ya validados por el servidor). */
export interface Comprador {
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  perfilCompleto: boolean;
}

type Fallo = Extract<ResultadoAccion<unknown>, { success: false }>;

function Esqueleto() {
  return (
    <div role="status" aria-live="polite" className={s.contenido}>
      <span className="sr-only">Preparando tu compra…</span>
      <div className={`${s.esqueleto} ${s.esqueletoTitulo}`} aria-hidden />
      <div className={`${s.esqueleto} ${s.esqueletoResumen}`} aria-hidden />
      <div className={`${s.esqueleto} ${s.esqueletoMapa}`} aria-hidden />
    </div>
  );
}

/** Estado inicial de la barra de pago: aún no hay método elegido. */
const ESTADO_BARRA_INICIAL: EstadoBarraPago = { modo: "ninguno", etiqueta: "Reportar pago", subiendo: false, deshabilitado: true };

export function CompraBoleto({
  viaje,
  metodos,
  tasa,
  comprador,
}: {
  viaje: ViajePublico;
  metodos: MetodoPagoPasajero[];
  tasa: TasaRef | null;
  comprador: Comprador;
}) {
  const router = useRouter();

  // ── Estado de la compra ────────────────────────────────────────────────────
  const [fase, setFase] = useState<"iniciando" | "lista">("iniciando");
  const [compraId, setCompraId] = useState<string | null>(null);
  /** Clave de idempotencia del intento de pago: se reutiliza en reintentos y se renueva con la compra. */
  const [clave, setClave] = useState("");
  const [reserva, setReserva] = useState<ResumenCompra | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [pasajeros, setPasajeros] = useState<Record<string, DatosPasajero>>({});
  const [pasajerosGuardados, setPasajerosGuardados] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCompra | null>(null);
  const [noDisponible, setNoDisponible] = useState(false);
  const [aviso, setAviso] = useState<AvisoFlujo | null>(null);
  const [perfilOk, setPerfilOk] = useState(comprador.perfilCompleto);
  const [pidiendoPerfil, setPidiendoPerfil] = useState(false);
  const [intentoPasajeros, setIntentoPasajeros] = useState(false);
  const [focoToken, setFocoToken] = useState(0);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [errorPasajeros, setErrorPasajeros] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaPasajero[]>([]);
  const [tasaActual, setTasaActual] = useState<TasaRef | null>(tasa);
  const [totalBsServidor, setTotalBsServidor] = useState<number | null>(null);
  const [tasaCambio, setTasaCambio] = useState<{ aviso: TasaCambiada; datos: DatosPagoPasajero } | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const enCursoRef = useRef(false);
  /** Qué botón debe dibujar la barra en el paso de pago (lo informa `PagoPasajero`). */
  const [barraPago, setBarraPago] = useState<EstadoBarraPago>(ESTADO_BARRA_INICIAL);

  const reservados = useMemo(
    () =>
      reserva
        ? ordenarAsientos(reserva.boletos.filter((b) => b.estado === "RESERVADO").map((b) => b.asiento))
        : [],
    [reserva]
  );

  // ── Paso en la URL ─────────────────────────────────────────────────────────
  const esAccesible = useCallback(
    (p: PasoCompra) => {
      if (fase === "iniciando") return true;
      // Con la compra terminada ningún paso se redirige solo: lo ordena `mostrarListo` / el reinicio.
      if (resultado) return true;
      if (p === "asientos") return true;
      if (p === "pasajeros") return reserva !== null;
      if (p === "pago") return reserva !== null && pasajerosGuardados;
      return false;
    },
    [fase, resultado, reserva, pasajerosGuardados]
  );
  const url = usePasoEnUrl(PASOS_COMPRA, { esAccesible });
  const paso = url.paso;
  const irAPaso = url.ir;

  const salida = useSalidaProtegida({ activo: reserva !== null && resultado === null, bloqueado: enCurso });

  const asientosActivos = fase === "lista" && paso === "asientos" && !noDisponible && resultado === null;
  const lecturaOcupados = useAsientosOcupados(viaje.id, asientosActivos);
  const recargarOcupados = lecturaOcupados.recargar;
  // Los asientos que esta misma compra tiene apartados no cuentan como ocupados para quien compra.
  const ocupadosMapa = useMemo(() => {
    const ocupados = lecturaOcupados.ocupados;
    if (!ocupados) return null;
    return new Set([...ocupados].filter((a) => !reservados.includes(a)));
  }, [lecturaOcupados.ocupados, reservados]);

  // ── Refs para limpiar al salir ─────────────────────────────────────────────
  const vivo = useRef({ compraId, reserva, resultado });
  const reservadosRef = useRef<string[]>([]);
  const liberadaRef = useRef(false);
  useEffect(() => {
    vivo.current = { compraId, reserva, resultado };
    reservadosRef.current = reservados;
  });

  // Al desmontar (navegar a otra página) sin pagar ni apartar para taquilla: suelta los asientos.
  // Recargar la pestaña no pasa por aquí: la compra se retoma con lo guardado en sessionStorage.
  useEffect(
    () => () => {
      const v = vivo.current;
      if (v.compraId && v.reserva && !v.resultado && !liberadaRef.current) {
        void liberarReserva(v.compraId).catch(() => undefined);
      }
    },
    []
  );

  // ── Utilidades de estado ───────────────────────────────────────────────────
  const actualizarOffset = useCallback((serverNow: string | null | undefined) => {
    const t = serverNow ? Date.parse(serverNow) : NaN;
    if (!Number.isNaN(t)) setOffsetMs(t - Date.now());
  }, []);

  /** Guarda la respuesta de `fn_reservar_asientos` y deja listos los datos de cada asiento. */
  const aplicarReserva = useCallback(
    (r: ResumenCompra) => {
      const nuevos = ordenarAsientos(r.boletos.filter((b) => b.estado === "RESERVADO").map((b) => b.asiento));
      const previos = reservadosRef.current;
      const igual = previos.length === nuevos.length && previos.every((a, i) => a === nuevos[i]);
      setReserva(r);
      actualizarOffset(r.serverNow);
      setPasajerosGuardados((p) => p && igual);
      setPasajeros((prev) => Object.fromEntries(nuevos.map((a) => [a, prev[a] ?? PASAJERO_VACIO])));
      if (r.tasa) setTasaActual({ tasa: r.tasa, fecha: r.tasaFecha ?? tasa?.fecha ?? hoyVE() });
      setTotalBsServidor(r.totalBs);
      liberadaRef.current = false;
    },
    [actualizarOffset, tasa?.fecha]
  );

  /** Empieza una compra nueva (otro `compra_id` y otra clave) volviendo al mapa. */
  const reiniciarCompra = useCallback(
    (nuevoAviso: AvisoFlujo | null) => {
      setCompraId(nuevoId());
      setClave(nuevoId());
      setReserva(null);
      setPasajerosGuardados(false);
      setTasaCambio(null);
      setErrorPago(null);
      setErrorPasajeros(null);
      setMarcados([]);
      setIntentoPasajeros(false);
      setPidiendoPerfil(false);
      setAviso(nuevoAviso);
      irAPaso("asientos", { reemplazar: true });
      void recargarOcupados();
    },
    [irAPaso, recargarOcupados]
  );

  /** Vuelve a una compra en blanco (tras terminar, o al volver atrás desde la confirmación). */
  const reiniciarTodo = useCallback(() => {
    borrarListo(viaje.id);
    borrarCompra(viaje.id);
    setResultado(null);
    setSeleccion([]);
    setPasajeros({});
    liberadaRef.current = false;
    reiniciarCompra(null);
  }, [viaje.id, reiniciarCompra]);

  /**
   * Muestra la pantalla final. El resultado se confirma antes de cambiar el paso de la URL: con el
   * orden contrario, un primer pintado con "listo" y sin resultado haría volver al mapa.
   */
  const mostrarListo = useCallback(
    (res: ResultadoCompra) => {
      flushSync(() => {
        setResultado(res);
        setErrorPago(null);
        setTasaCambio(null);
      });
      irAPaso("listo", { reemplazar: true });
    },
    [irAPaso]
  );

  // ── Restaurar al entrar (recarga, o volver de iniciar sesión) ──────────────
  useEffect(() => {
    let cancelado = false;
    async function restaurar() {
      // sessionStorage solo existe en el navegador: se lee después de montar.
      await Promise.resolve();
      if (cancelado) return;

      const enListo = new URLSearchParams(window.location.search).get("paso") === "listo";
      const listo = enListo ? leerListo(viaje.id) : null;
      if (listo) {
        setResultado(listo);
        setOffsetMs(listo.offsetMs ?? 0);
        setFase("lista");
        return;
      }
      borrarListo(viaje.id);

      const guardada = leerCompra(viaje.id);
      if (!guardada) {
        setCompraId(nuevoId());
        setClave(nuevoId());
        setFase("lista");
        return;
      }
      setCompraId(guardada.compraId);
      setClave(guardada.clave);
      setPasajeros(guardada.pasajeros);
      if (guardada.asientos.length === 0) {
        setFase("lista");
        return;
      }

      // Había asientos apartados: se confirman con el servidor (repetir la reserva es seguro).
      try {
        const r = await reservarAsientos({ compraId: guardada.compraId, viajeId: viaje.id, asientos: guardada.asientos });
        if (cancelado) return;
        if (r.success) {
          aplicarReserva(r.data);
          setSeleccion(guardada.asientos);
          setPasajerosGuardados(guardada.pasajerosGuardados);
        } else if (r.codigo === "EB_PAGO_YA_REGISTRADO") {
          const res: ResultadoCompra = { modo: "verificacion", resumen: null };
          guardarListo(viaje.id, res);
          borrarCompra(viaje.id);
          setFase("lista");
          mostrarListo(res);
          return;
        } else if (r.codigo === "EB_VIAJE_NO_DISPONIBLE") {
          setNoDisponible(true);
        } else if (r.codigo === "EB_NO_AUTENTICADO") {
          // Navegación completa: al volver con sesión no debe quedar caché del router.
          window.location.assign(urlIngresar(urlComprarBoleto(viaje.id)));
          return;
        } else {
          // Los asientos ya no están (vencieron o los tomaron): compra nueva con un aviso claro.
          const tomados = asientosDelError(r.detalle);
          setSeleccion(guardada.asientos.filter((a) => !tomados.includes(a)));
          setCompraId(nuevoId());
          setClave(nuevoId());
          setAviso({
            tono: "error",
            texto: tomados.length > 0 ? mensajeAsientosTomados(tomados) : "Tu reserva anterior ya no está vigente. Elige tus asientos de nuevo.",
          });
        }
      } catch (err) {
        if (cancelado) return;
        setAviso({ tono: "error", texto: humanizeError(err, "recuperar tu compra") });
      }
      setFase("lista");
    }
    void restaurar();
    return () => {
      cancelado = true;
    };
    // Solo al montar (o cambiar de viaje): `aplicarReserva`, `mostrarListo` y `router` son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaje.id]);

  // Guarda lo avanzado para sobrevivir a una recarga.
  useEffect(() => {
    if (fase !== "lista" || !compraId || resultado) return;
    guardarCompra(viaje.id, { compraId, clave, asientos: reservados, pasajeros, pasajerosGuardados });
  }, [fase, compraId, clave, reservados, pasajeros, pasajerosGuardados, resultado, viaje.id]);

  // Con la compra terminada, cualquier otro paso en la URL (atrás del navegador) empieza de cero.
  useEffect(() => {
    if (fase !== "lista" || !resultado || paso === "listo") return;
    const id = window.setTimeout(reiniciarTodo, 0);
    return () => window.clearTimeout(id);
  }, [fase, resultado, paso, reiniciarTodo]);

  // Las sugerencias de pasajeros anteriores se leen una vez, al llegar al paso.
  const sugerenciasPedidas = useRef(false);
  useEffect(() => {
    if (paso !== "pasajeros" || sugerenciasPedidas.current) return;
    sugerenciasPedidas.current = true;
    sugerenciasPasajeros()
      .then((r) => {
        if (r.success) setSugerencias(r.data);
      })
      .catch(() => undefined);
  }, [paso]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const ejecutar = useCallback(async (fn: () => Promise<void>) => {
    if (enCursoRef.current) return;
    enCursoRef.current = true;
    setEnCurso(true);
    try {
      await fn();
    } finally {
      enCursoRef.current = false;
      setEnCurso(false);
    }
  }, []);

  /** Errores que valen para cualquier paso. true = ya manejado. */
  const errorComun = useCallback(
    (r: Fallo): boolean => {
      if (r.codigo === "EB_NO_AUTENTICADO") {
        window.location.assign(urlIngresar(urlComprarBoleto(viaje.id)));
        return true;
      }
      if (r.codigo === "EB_VIAJE_NO_DISPONIBLE") {
        setNoDisponible(true);
        return true;
      }
      return false;
    },
    [viaje.id]
  );

  /** La reserva venció o ya no existe: se suelta lo local y se vuelve al mapa. */
  const reservaPerdida = useCallback(
    (texto: string) => {
      liberadaRef.current = true;
      reiniciarCompra({ tono: "error", texto });
    },
    [reiniciarCompra]
  );

  /** Algún asiento lo tomó otra persona: vuelve al mapa marcándolo. */
  const asientosTomados = useCallback(
    (tomados: string[]) => {
      setSeleccion((prev) => prev.filter((a) => !tomados.includes(a)));
      setAviso({ tono: "error", texto: mensajeAsientosTomados(tomados) });
      irAPaso("asientos", { reemplazar: true });
      void recargarOcupados();
    },
    [irAPaso, recargarOcupados]
  );

  const reservar = (asientos: string[]) =>
      ejecutar(async () => {
        if (!compraId) return;
        setAviso(null);
        try {
          const r = await reservarAsientos({ compraId, viajeId: viaje.id, asientos });
          if (!r.success) {
            if (errorComun(r)) return;
            if (r.codigo === "EB_ASIENTO_OCUPADO") {
              asientosTomados(asientosDelError(r.detalle));
              return;
            }
            if (r.codigo === "EB_PAGO_YA_REGISTRADO") {
              terminar("verificacion", null);
              return;
            }
            setAviso({ tono: "error", texto: r.error });
            return;
          }
          aplicarReserva(r.data);
          setSeleccion(ordenarAsientos(r.data.boletos.filter((b) => b.estado === "RESERVADO").map((b) => b.asiento)));
          url.siguiente();
        } catch (err) {
          setAviso({ tono: "error", texto: humanizeError(err, "apartar tus asientos") });
        }
      });

  const continuarAsientos = () => {
    if (enCursoRef.current || seleccion.length === 0) return;
    // Sin cédula y teléfono en el perfil se piden aquí, antes de apartar.
    if (!perfilOk) {
      setPidiendoPerfil(true);
      return;
    }
    void reservar(seleccion);
  };

  const alCompletarPerfil = () => {
    setPerfilOk(true);
    setPidiendoPerfil(false);
    if (seleccion.length > 0) void reservar(seleccion);
  };

  const editarPasajero = (asiento: string, campo: keyof DatosPasajero, valor: string) => {
    setPasajeros((prev) => ({ ...prev, [asiento]: { ...(prev[asiento] ?? PASAJERO_VACIO), [campo]: valor } }));
    setMarcados((prev) => prev.filter((a) => a !== asiento));
  };
  const rellenarPasajero = (asiento: string, datos: DatosPasajero) => {
    setPasajeros((prev) => ({ ...prev, [asiento]: datos }));
    setMarcados((prev) => prev.filter((a) => a !== asiento));
  };

  const enviarPasajeros = () =>
    ejecutar(async () => {
      if (!compraId) return;
      setIntentoPasajeros(true);
      setErrorPasajeros(null);
      if (reservados.length === 0) {
        reservaPerdida("Tu reserva ya no tiene asientos apartados. Elígelos de nuevo.");
        return;
      }
      if (reservados.some((a) => !pasajeroValido(pasajeros[a]))) {
        setFocoToken((t) => t + 1);
        return;
      }
      try {
        const r = await asignarPasajeros({
          compraId,
          pasajeros: reservados.map((a) => pasajeroParaGuardar(a, pasajeros[a] ?? PASAJERO_VACIO)),
        });
        if (!r.success) {
          if (errorComun(r)) return;
          if (r.codigo === "EB_DATOS_PASAJERO") {
            setMarcados(asientosDelError(r.detalle));
            setErrorPasajeros(r.error);
            setFocoToken((t) => t + 1);
            return;
          }
          if (r.codigo === "EB_ESTADO_CAMBIO" || r.codigo === "EB_SIN_PERMISO") {
            reservaPerdida("Tus asientos ya no están apartados. Elígelos de nuevo para continuar.");
            return;
          }
          setErrorPasajeros(r.error);
          return;
        }
        actualizarOffset(r.data.serverNow);
        setMarcados([]);
        setPasajerosGuardados(true);
        url.siguiente();
      } catch (err) {
        setErrorPasajeros(humanizeError(err, "guardar los datos de los pasajeros"));
      }
    });

  /** La compra terminó: guarda el resultado para la pantalla final y limpia la compra en curso. */
  function terminar(modo: ResultadoCompra["modo"], resumen: ResumenCompra | null) {
    const res: ResultadoCompra = { modo, resumen, offsetMs };
    guardarListo(viaje.id, res);
    borrarCompra(viaje.id);
    salida.permitirSalida();
    mostrarListo(res);
  }

  const enviarPago = (datos: DatosPagoPasajero, tasaEsperada: number | null) =>
    ejecutar(async () => {
      if (!compraId) return;
      setErrorPago(null);
      if (reservados.length === 0) {
        reservaPerdida("Tu reserva ya no tiene asientos apartados. Elígelos de nuevo.");
        return;
      }
      try {
        const r = await reportarPago({
          compraId,
          viajeId: viaje.id,
          asientos: reservados,
          metodoPagoId: datos.metodoPagoId,
          numeroReferencia: datos.numeroReferencia,
          fechaTransaccion: datos.fechaTransaccion,
          bancoEmisor: datos.bancoEmisor,
          montoDeclarado: datos.montoDeclarado,
          comprobantePath: datos.comprobantePath ?? null,
          tasaEsperada,
          claveIdempotencia: clave,
        });
        if (r.success) {
          actualizarOffset(r.data.serverNow);
          terminar("verificacion", r.data);
          return;
        }
        if (errorComun(r)) return;
        switch (r.codigo) {
          case "EB_TASA_CAMBIO": {
            const nueva = Number(r.detalle?.tasa);
            const totalBs = Number(r.detalle?.total_bs);
            if (!(nueva > 0) || !(totalBs > 0)) {
              setErrorPago(r.error);
              return;
            }
            const totalUsd = Number(r.detalle?.total_usd);
            const fecha = typeof r.detalle?.tasa_fecha === "string" ? r.detalle.tasa_fecha : (tasaActual?.fecha ?? hoyVE());
            setTasaActual({ tasa: nueva, fecha });
            setTotalBsServidor(totalBs);
            setTasaCambio({
              aviso: { totalBs, totalUsd: totalUsd > 0 ? totalUsd : null, tasa: nueva, tasaFecha: fecha },
              datos,
            });
            return;
          }
          case "EB_ASIENTO_OCUPADO":
            asientosTomados(asientosDelError(r.detalle));
            return;
          case "EB_DATOS_PASAJERO":
            setMarcados(asientosDelError(r.detalle));
            setIntentoPasajeros(true);
            setErrorPasajeros(r.error);
            setFocoToken((t) => t + 1);
            irAPaso("pasajeros", { reemplazar: true });
            return;
          case "EB_PAGO_YA_REGISTRADO":
            terminar("verificacion", null);
            return;
          case "EB_ESTADO_CAMBIO":
            reservaPerdida("Tus asientos ya no están apartados. Elígelos de nuevo para continuar.");
            return;
          default:
            setErrorPago(r.error);
        }
      } catch (err) {
        // La clave de idempotencia se conserva: reintentar no duplica el pago.
        setErrorPago(humanizeError(err, "reportar tu pago"));
      }
    });

  const apartarEnTaquilla = () => {
    if (enCursoRef.current || !reserva) return;
    terminar("taquilla", reserva);
  };

  /** Suelta la reserva en el servidor y borra lo guardado; no lanza. */
  const soltarReserva = useCallback(async () => {
    const id = compraId;
    if (reserva && id) {
      liberadaRef.current = true;
      try {
        await liberarReserva(id);
      } catch {
        /* si falla, el cron la libera al vencer */
      }
    }
    borrarCompra(viaje.id);
  }, [compraId, reserva, viaje.id]);

  const urlBusqueda = urlViajes({ origen: viaje.origen, destino: viaje.destino, fecha: fechaVE(viaje.salida) });

  const cancelarCompra = () =>
    salida.confirmarSalida(() => {
      void (async () => {
        enCursoRef.current = true;
        setEnCurso(true);
        await soltarReserva();
        salida.permitirSalida();
        router.push(urlBusqueda);
      })();
    });

  const alVencerRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    alVencerRef.current = () => {
      // Si hay una petición en curso (p. ej. reportando el pago) se espera su respuesta.
      if (enCursoRef.current) {
        window.setTimeout(() => alVencerRef.current(), 2000);
        return;
      }
      if (vivo.current.resultado) return;
      reservaPerdida("Tu reserva venció y soltamos los asientos. Elígelos de nuevo para continuar.");
    };
  });
  const alVencer = useCallback(() => alVencerRef.current(), []);


  const atras = () => {
    if (enCurso) return;
    if (paso === "asientos") salida.confirmarSalida(() => router.push(urlBusqueda));
    else url.anterior();
  };

  // ── Derivados para mostrar ─────────────────────────────────────────────────
  const asientosResumen = ordenarAsientos(paso === "asientos" || !reserva ? seleccion : reservados);
  const totalUsd =
    paso === "asientos" || !reserva ? seleccion.length * viaje.precioUsd : (reserva.totalUsd ?? reservados.length * viaje.precioUsd);
  const totalBs = paso !== "asientos" && reserva ? totalBsServidor : null;
  const total = asientosResumen.length > 0 ? totalEnVivo(totalUsd, totalBs, tasaActual) : null;
  const expiraAt = reserva && !resultado ? reserva.reservaExpiraAt : null;

  const yo: DatosPasajero | null =
    comprador.cedula && comprador.nombre.trim().length >= 3
      ? { nombre: comprador.nombre.trim(), cedula: comprador.cedula, telefono: comprador.telefono ?? "" }
      : null;

  // ── Barra: "ASIENTO 20 · MÉRIDA → BARINAS" + total destacado + la acción del paso ──
  const resumenBarra: ReactNode =
    total && asientosResumen.length > 0
      ? `${etiquetaAsientos(asientosResumen)} · ${formatCiudad(viaje.origen)} → ${formatCiudad(viaje.destino)}`
      : paso === "asientos"
        ? "Toca los asientos que quieres."
        : undefined;
  const totalBarra = total && asientosResumen.length > 0 ? totalParaBarra(total) : undefined;

  let principal: AccionBarraFlujo;
  let secundaria: { etiqueta: string; onClick: () => void } | undefined;
  if (paso === "listo") {
    principal = {
      etiqueta: "Ver mis boletos",
      onClick: () => {
        borrarListo(viaje.id);
        router.push(RUTAS_PASAJERO.misBoletos);
      },
    };
    secundaria = { etiqueta: "Otra compra", onClick: reiniciarTodo };
  } else if (paso === "asientos") {
    principal = {
      etiqueta: "Continuar",
      flecha: true,
      etiquetaCargando: "Apartando asientos…",
      onClick: continuarAsientos,
      deshabilitado: seleccion.length === 0 || pidiendoPerfil,
      cargando: enCurso,
    };
  } else if (paso === "pasajeros") {
    principal = {
      etiqueta: "Continuar",
      flecha: true,
      etiquetaCargando: "Guardando…",
      type: "submit",
      form: ID_FORM_PASAJEROS,
      cargando: enCurso,
    };
  } else if (barraPago.modo === "taquilla") {
    principal = {
      etiqueta: barraPago.etiqueta,
      etiquetaCargando: "Apartando…",
      onClick: apartarEnTaquilla,
      cargando: enCurso,
    };
  } else if (barraPago.modo === "reportar") {
    principal = {
      etiqueta: barraPago.etiqueta,
      etiquetaCargando: barraPago.subiendo ? "Subiendo capture…" : "Enviando…",
      type: "submit",
      form: ID_FORM_PAGO_PASAJERO,
      cargando: enCurso || barraPago.subiendo,
      deshabilitado: barraPago.deshabilitado,
    };
  } else {
    principal = { etiqueta: barraPago.etiqueta, deshabilitado: true };
  }

  const titulo = paso === "listo" ? (resultado?.modo === "taquilla" ? "Asientos apartados" : "Pago reportado") : TITULOS_PASO[paso];
  const indicePaso = PASOS_VISIBLES.indexOf(paso as (typeof PASOS_VISIBLES)[number]);

  if (fase === "iniciando") {
    return (
      <ArmazonFlujoSitio>
        <Esqueleto />
      </ArmazonFlujoSitio>
    );
  }

  if (noDisponible) {
    return (
      <>
        {salida.dialogo}
        <SalidaNoDisponible origen={viaje.origen} destino={viaje.destino} fecha={fechaVE(viaje.salida)} />
      </>
    );
  }

  return (
    <ArmazonFlujoSitio>
      {salida.dialogo}
      <FlujoPagina
        titulo={titulo}
        paso={indicePaso >= 0 ? indicePaso + 1 : undefined}
        total={indicePaso >= 0 ? PASOS_VISIBLES.length : undefined}
        onAtras={paso === "listo" ? undefined : atras}
        atrasEtiqueta={paso === "asientos" ? "Volver a otras salidas" : "Volver al paso anterior"}
        descripcion={descripcionViaje(viaje)}
        barra={<BarraFlujo resumen={resumenBarra} total={totalBarra} principal={principal} secundaria={secundaria} />}
      >
        {expiraAt && paso !== "listo" && (
          <CuentaRegresiva expiraAt={expiraAt} offsetMs={offsetMs} onVence={alVencer} />
        )}

        {paso === "asientos" && (
          <PasoAsientos
            totalAsientos={viaje.asientosTotales}
            ocupados={ocupadosMapa}
            errorOcupados={lecturaOcupados.error}
            onReintentar={recargarOcupados}
            seleccion={seleccion}
            onChange={setSeleccion}
            bloqueado={enCurso}
            aviso={aviso}
            pidiendoPerfil={pidiendoPerfil && !perfilOk}
            cedulaInicial={comprador.cedula}
            telefonoInicial={comprador.telefono}
            onPerfilListo={alCompletarPerfil}
          />
        )}

        {paso === "pasajeros" && reserva && (
          <PasoPasajeros
            asientos={reservados}
            pasajeros={pasajeros}
            yo={yo}
            sugerencias={sugerencias.filter((g) => g.cedula !== yo?.cedula)}
            intento={intentoPasajeros}
            focoToken={focoToken}
            marcados={marcados}
            error={errorPasajeros}
            onEditar={editarPasajero}
            onRellenar={rellenarPasajero}
            onEnviar={() => void enviarPasajeros()}
            bloqueado={enCurso}
          />
        )}

        {paso === "pago" && reserva && (
          <PasoPago
            metodos={metodos}
            totalUsd={totalUsd}
            totalBs={totalBs}
            tasa={tasaActual}
            enviando={enCurso}
            error={errorPago}
            tasaCambiada={tasaCambio?.aviso ?? null}
            onEnviar={(datos) => {
              setTasaCambio(null);
              void enviarPago(datos, tasaActual?.tasa ?? null);
            }}
            onTaquilla={apartarEnTaquilla}
            onConfirmarTasa={() => {
              if (tasaCambio) void enviarPago(tasaCambio.datos, tasaCambio.aviso.tasa);
            }}
            onDescartarTasa={() => setTasaCambio(null)}
            onBarra={setBarraPago}
          />
        )}

        {paso === "listo" && resultado && (
          <PasoListo
            viaje={viaje}
            resultado={resultado}
            offsetMs={resultado.offsetMs ?? offsetMs}
            tasa={tasaActual}
            pasajeros={pasajeros}
            onSalir={() => borrarListo(viaje.id)}
          />
        )}

        {reserva && !resultado && paso !== "listo" && (
          <button type="button" className={s.cancelar} onClick={cancelarCompra} disabled={enCurso}>
            Cancelar compra
          </button>
        )}
      </FlujoPagina>
    </ArmazonFlujoSitio>
  );
}
