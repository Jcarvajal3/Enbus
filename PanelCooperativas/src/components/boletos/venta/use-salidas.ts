"use client";

// ─── Salidas a la venta (paso 1) ─────────────────────────────────────────────
// Consulta los viajes PROGRAMADO de la cooperativa por día de salida (hora de
// Venezuela) y ruta. Al abrir muestra el día del viaje pedido (`?viaje=`, desde
// Embarque) o, si no, el de la próxima salida (hoy si aún quedan; si no, el
// próximo día que tenga). El día y la ruta viven aquí, en la página: "Vender otro"
// los conserva (la cola suele viajar el mismo día).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/errores";
import { fechaVE, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { etiquetaRuta, type ViajeParaVenta } from "./tipos";

/** Columnas de un viaje a la venta (con su ruta y el chofer para la tarjeta). */
const COLUMNAS_VIAJE = `
  id, ruta_id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
  asientos_disponibles, estado, numero_unidad, nombre_chofer,
  ruta:rutas(ciudad_origen, estado_origen, ciudad_destino, estado_destino, precio_pasaje)
`;

/** El servidor acepta ventas hasta 30 minutos después de la hora de salida. */
const MARGEN_VENTA_MS = 30 * 60 * 1000;

/** Tope de salidas de un día (con salidas recurrentes puede haber muchas; PostgREST corta en 1000 sin avisar). */
export const LIMITE_VIAJES_DIA = 200;

/** Primer instante (ISO) en el que todavía se puede vender una salida. */
function inicioVenta() {
  return new Date(Date.now() - MARGEN_VENTA_MS).toISOString();
}

/** Opción del filtro de ruta: rutas con las mismas ciudades se agrupan bajo una etiqueta. */
export type OpcionRuta = { etiqueta: string; ids: string[] };

export const TODAS_LAS_RUTAS = "todas";

export type Salidas = ReturnType<typeof useSalidas>;

export function useSalidas({
  cooperativaId,
  viajeIdInicial,
  cargar,
  onInicial,
}: {
  cooperativaId: string | null | undefined;
  /** Salida a preseleccionar (viene de Embarque). */
  viajeIdInicial: string | null;
  /** Consultar la lista (solo en el paso 1: al volver se recarga, los asientos libres cambian con cada venta). */
  cargar: boolean;
  /** La salida pedida (`null` si ya no está a la venta). Se llama una sola vez. */
  onInicial: (viaje: ViajeParaVenta | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [viajes, setViajes] = useState<ViajeParaVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Hay más salidas ese día que las listadas (tope `LIMITE_VIAJES_DIA`). */
  const [hayMas, setHayMas] = useState(false);
  /** Día de salida ('YYYY-MM-DD' en Venezuela); null hasta decidir el inicial. */
  const [dia, setDia] = useState<string | null>(null);
  /** Si el día elegido no tiene salidas: el próximo día que sí tiene (para ofrecer el salto). */
  const [proximoDia, setProximoDia] = useState<string | null>(null);
  const [rutas, setRutas] = useState<OpcionRuta[]>([]);
  const [filtroRuta, setFiltroRuta] = useState<string>(TODAS_LAS_RUTAS);

  // Última carga: una respuesta vieja (otro día u otra ruta) no pisa la nueva.
  const cargaRef = useRef(0);
  const inicialUsado = useRef(false);
  const resolviendoDia = useRef(false);
  const inicialReportada = useRef(false);
  const onInicialRef = useRef(onInicial);
  useEffect(() => {
    onInicialRef.current = onInicial;
  });

  /** Viajes a la venta de la cooperativa (PROGRAMADO), opcionalmente de unas rutas. */
  const consultaViajes = useCallback(
    (columnas: string, idsRuta: string[] | null) => {
      let q = supabase.from("viajes").select(columnas).eq("cooperativa_id", cooperativaId ?? "").eq("estado", "PROGRAMADO");
      if (idsRuta) q = q.in("ruta_id", idsRuta);
      return q;
    },
    [supabase, cooperativaId]
  );

  const idsRuta = useMemo(
    () => (filtroRuta === TODAS_LAS_RUTAS ? null : (rutas.find((r) => r.etiqueta === filtroRuta)?.ids ?? null)),
    [filtroRuta, rutas]
  );

  /** Día inicial: el del viaje pedido o el de la próxima salida a la venta. */
  const resolverDiaInicial = useCallback(async () => {
    if (!cooperativaId || resolviendoDia.current) return;
    resolviendoDia.current = true;
    try {
      if (viajeIdInicial && !inicialUsado.current) {
        inicialUsado.current = true;
        const { data, error: e } = await consultaViajes(COLUMNAS_VIAJE, null)
          .eq("id", viajeIdInicial)
          .gt("fecha_hora_salida", inicioVenta())
          .maybeSingle();
        if (e) throw e;
        const inicial = data as unknown as ViajeParaVenta | null;
        inicialReportada.current = true;
        onInicialRef.current(inicial);
        if (inicial) {
          setDia(fechaVE(inicial.fecha_hora_salida));
          return;
        }
      }
      const { data, error: e } = await consultaViajes("fecha_hora_salida", null)
        .gt("fecha_hora_salida", inicioVenta())
        .order("fecha_hora_salida", { ascending: true })
        .limit(1);
      if (e) throw e;
      const primera = (data as unknown as { fecha_hora_salida: string }[] | null)?.[0];
      setDia(primera ? fechaVE(primera.fecha_hora_salida) : hoyVE());
    } catch {
      // Sin la próxima salida se muestra hoy; si la red falla, la carga del día lo dirá.
      // Si la salida pedida no llegó a resolverse, se avisa para no dejar la página esperándola.
      if (viajeIdInicial && !inicialReportada.current) onInicialRef.current(null);
      setDia(hoyVE());
    } finally {
      resolviendoDia.current = false;
    }
  }, [cooperativaId, consultaViajes, viajeIdInicial]);

  /** Rutas para el filtro (todas las de la cooperativa, agrupadas por ciudades). */
  const fetchRutas = useCallback(async () => {
    if (!cooperativaId) return;
    const { data, error: e } = await supabase
      .from("rutas")
      .select("id, ciudad_origen, ciudad_destino")
      .eq("cooperativa_id", cooperativaId);
    // Sin rutas el filtro queda en "Todas las rutas": la venta sigue funcionando.
    if (e || !data) return;
    const grupos = new Map<string, string[]>();
    for (const r of data as { id: string; ciudad_origen: string; ciudad_destino: string }[]) {
      const etiqueta = etiquetaRuta(r);
      grupos.set(etiqueta, [...(grupos.get(etiqueta) ?? []), r.id]);
    }
    setRutas(
      Array.from(grupos, ([etiqueta, ids]) => ({ etiqueta, ids })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"))
    );
  }, [supabase, cooperativaId]);

  /** Salidas a la venta del día elegido (y de la ruta), consultadas al servidor. */
  const fetchViajes = useCallback(async () => {
    if (!cooperativaId || !dia) return;
    const carga = ++cargaRef.current;
    setCargando(true);
    setError(null);
    try {
      const { desde, hasta } = rangoDiaVE(dia);
      const minimo = inicioVenta();
      // Hoy: solo las salidas que todavía se pueden vender.
      const inicio = desde > minimo ? desde : minimo;
      let lista: ViajeParaVenta[] = [];
      if (inicio <= hasta) {
        const { data, error: e } = await consultaViajes(COLUMNAS_VIAJE, idsRuta)
          .gte("fecha_hora_salida", inicio)
          .lte("fecha_hora_salida", hasta)
          .order("fecha_hora_salida", { ascending: true })
          .limit(LIMITE_VIAJES_DIA + 1);
        if (e) throw e;
        lista = (data ?? []) as unknown as ViajeParaVenta[];
      }
      // Día sin salidas: se busca el próximo que tenga, para ofrecer ir a él.
      let siguiente: string | null = null;
      if (lista.length === 0) {
        const { data, error: e } = await consultaViajes("fecha_hora_salida", idsRuta)
          .gt("fecha_hora_salida", hasta > minimo ? hasta : minimo)
          .order("fecha_hora_salida", { ascending: true })
          .limit(1);
        if (e) throw e;
        const primera = (data as unknown as { fecha_hora_salida: string }[] | null)?.[0];
        siguiente = primera ? fechaVE(primera.fecha_hora_salida) : null;
      }
      if (carga !== cargaRef.current) return;
      setHayMas(lista.length > LIMITE_VIAJES_DIA);
      setViajes(lista.slice(0, LIMITE_VIAJES_DIA));
      setProximoDia(siguiente);
    } catch (err) {
      if (carga === cargaRef.current) setError(humanizeError(err, "cargar los viajes disponibles"));
    } finally {
      if (carga === cargaRef.current) setCargando(false);
    }
  }, [cooperativaId, dia, idsRuta, consultaViajes]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (dia === null) void resolverDiaInicial();
  }, [dia, resolverDiaInicial]);

  useEffect(() => {
    if (rutas.length === 0) void fetchRutas();
  }, [rutas.length, fetchRutas]);

  // Al volver al paso 1 se recarga: los asientos libres cambian con cada venta.
  useEffect(() => {
    if (cargar && dia) void fetchViajes();
  }, [cargar, dia, fetchViajes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const cambiarDia = useCallback((nuevo: string) => setDia((actual) => (actual === nuevo ? actual : nuevo)), []);

  return {
    viajes,
    /** Cargando la lista o decidiendo el día inicial. */
    cargando: cargando || dia === null,
    error,
    hayMas,
    dia,
    cambiarDia,
    proximoDia,
    rutas,
    filtroRuta,
    setFiltroRuta,
    hayFiltroRuta: filtroRuta !== TODAS_LAS_RUTAS,
    recargar: fetchViajes,
  };
}
