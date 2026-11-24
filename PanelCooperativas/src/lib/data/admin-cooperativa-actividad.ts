import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { rangoDiaVE } from "@/lib/fechas";
import { requireSuperAdmin, esUuid } from "./admin-auth";
import { aCentavos, deCentavos, esFechaValida, leerTodas } from "./admin-consultas";
import {
  ESTADOS_BOLETO,
  ESTADOS_ENCOMIENDA,
  ESTADOS_PAGO,
  ESTADOS_VIAJE,
  FILAS_ACTIVIDAD,
  type ActividadPestana,
  type BoletoActividad,
  type EncomiendaActividad,
  type FiltrosActividad,
  type PaginaActividad,
  type PagoActividad,
  type PestanaActividad,
  type ResumenActividad,
  type ViajeActividad,
} from "@/lib/types/admin-cooperativa-actividad";

// ─── Actividad de una cooperativa (super admin) ──────────────────────────────
// El super admin lee viajes, boletos, encomiendas y pagos por RLS ("Super Admin
// ve …"), así que se usa el cliente con su sesión, no la service role. Cada
// lista se pagina en el servidor (25 filas) y solo se carga la de la pestaña
// abierta; las cifras de la cabecera son conteos (`head`) y una suma.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ESTADOS_POR_PESTANA: Record<PestanaActividad, readonly string[]> = {
  viajes: ESTADOS_VIAJE,
  boletos: ESTADOS_BOLETO,
  encomiendas: ESTADOS_ENCOMIENDA,
  pagos: ESTADOS_PAGO,
};

/** Boletos vendidos: PAGADO y también USADO (ya embarcó). */
const BOLETO_VENDIDO = ["PAGADO", "USADO"];

type Uno<T> = T | T[] | null | undefined;
/** PostgREST entrega un embed como objeto o, según la relación, como arreglo de uno. */
function uno<T>(v: Uno<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Normaliza lo que llega en la URL: estado, fechas y página válidos o vacíos. */
export function leerFiltrosActividad(
  pestana: PestanaActividad,
  params: { estado?: string; desde?: string; hasta?: string; pagina?: string }
): FiltrosActividad {
  const estado = params.estado && ESTADOS_POR_PESTANA[pestana].includes(params.estado) ? params.estado : "";
  const desde = esFechaValida(params.desde) ? params.desde : "";
  const hasta = esFechaValida(params.hasta) ? params.hasta : "";
  const n = Number.parseInt(params.pagina ?? "", 10);
  const pagina = Number.isFinite(n) && n >= 1 ? Math.min(n, 100_000) : 1;
  return { estado, desde, hasta, pagina };
}

export function esPestanaActividad(v: string): v is PestanaActividad {
  return v === "viajes" || v === "boletos" || v === "encomiendas" || v === "pagos";
}

async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>, que: string): Promise<number | null> {
  const { count, error } = await consulta;
  if (error) {
    console.error(`[actividad cooperativa] conteo de ${que}:`, error);
    return null;
  }
  return count ?? 0;
}

/** Cifras de la cabecera: conteos y la suma de los pagos verificados. Cada una falla sola (null). */
export async function fetchResumenActividad(cooperativaId: string): Promise<ResumenActividad> {
  await requireSuperAdmin();
  const vacio: ResumenActividad = {
    viajes_total: null,
    viajes_proximos: null,
    boletos_vendidos: null,
    encomiendas_total: null,
    encomiendas_en_curso: null,
    pagos_total: null,
    pagos_por_verificar: null,
    ingresos_usd: null,
    ingresos_bs: null,
  };
  if (!esUuid(cooperativaId)) return vacio;
  const supabase = await createClient();
  const ahora = new Date().toISOString();
  const head = { count: "exact", head: true } as const;

  const [
    viajesTotal,
    viajesProximos,
    boletosVendidos,
    encomiendasTotal,
    encomiendasEnCurso,
    pagosTotal,
    pagosPorVerificar,
    ingresos,
  ] = await Promise.all([
    contar(supabase.from("viajes").select("id", head).eq("cooperativa_id", cooperativaId), "viajes"),
    contar(
      supabase
        .from("viajes")
        .select("id", head)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "PROGRAMADO")
        .gte("fecha_hora_salida", ahora),
      "viajes próximos"
    ),
    contar(
      supabase.from("boletos").select("id", head).eq("cooperativa_id", cooperativaId).in("estado", BOLETO_VENDIDO),
      "boletos"
    ),
    contar(supabase.from("encomiendas").select("id", head).eq("cooperativa_id", cooperativaId), "encomiendas"),
    contar(
      supabase
        .from("encomiendas")
        .select("id", head)
        .eq("cooperativa_id", cooperativaId)
        .not("estado", "in", "(ENTREGADA,CANCELADA,DEVUELTA)"),
      "encomiendas en curso"
    ),
    contar(supabase.from("pagos").select("id", head).eq("cooperativa_id", cooperativaId), "pagos"),
    contar(
      supabase
        .from("pagos")
        .select("id", head)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado_verificacion", "PENDIENTE"),
      "pagos por verificar"
    ),
    sumarIngresos(supabase, cooperativaId),
  ]);

  return {
    viajes_total: viajesTotal,
    viajes_proximos: viajesProximos,
    boletos_vendidos: boletosVendidos,
    encomiendas_total: encomiendasTotal,
    encomiendas_en_curso: encomiendasEnCurso,
    pagos_total: pagosTotal,
    pagos_por_verificar: pagosPorVerificar,
    ingresos_usd: ingresos?.usd ?? null,
    ingresos_bs: ingresos?.bs ?? null,
  };
}

type FilaIngreso = { monto: number | string | null; monto_bs: number | string | null };

/** Σ de los pagos verificados (centavos enteros). null si falla o no cabe en el tope de lectura. */
async function sumarIngresos(supabase: Supabase, cooperativaId: string): Promise<{ usd: number; bs: number } | null> {
  try {
    const { filas, truncado } = await leerTodas<FilaIngreso>(
      (desde, hasta) =>
        supabase
          .from("pagos")
          .select("monto, monto_bs")
          .eq("cooperativa_id", cooperativaId)
          .eq("verificado", true)
          .order("id", { ascending: true })
          .range(desde, hasta) as unknown as PromiseLike<{ data: FilaIngreso[] | null; error: unknown }>
    );
    // Una suma parcial se vería como la real: sin dato antes que un total de menos.
    if (truncado) return null;
    let usd = 0;
    let bs = 0;
    for (const f of filas) {
      usd += aCentavos(f.monto);
      bs += aCentavos(f.monto_bs);
    }
    return { usd: deCentavos(usd), bs: deCentavos(bs) };
  } catch (error) {
    console.error("[actividad cooperativa] ingresos:", error);
    return null;
  }
}

/** Rango de la página `pagina` (base 1) para `.range()`. */
function rango(pagina: number) {
  const desde = (pagina - 1) * FILAS_ACTIVIDAD;
  return { desde, hasta: desde + FILAS_ACTIVIDAD - 1 };
}

/** Aplica el rango de fechas (días en hora de Venezuela) a la columna `col`. */
function conFechas<Q extends { gte(c: string, v: string): Q; lte(c: string, v: string): Q }>(
  q: Q,
  col: string,
  f: FiltrosActividad
): Q {
  let r = q;
  if (f.desde) r = r.gte(col, rangoDiaVE(f.desde).desde);
  if (f.hasta) r = r.lte(col, rangoDiaVE(f.hasta).hasta);
  return r;
}

function pagina<T>(filas: T[], total: number | null, f: FiltrosActividad, error: unknown, que: string): PaginaActividad<T> {
  if (error) console.error(`[actividad cooperativa] ${que}:`, error);
  return {
    filas,
    total: total ?? filas.length,
    pagina: f.pagina,
    porPagina: FILAS_ACTIVIDAD,
    error: error ? humanizeError(error, `cargar ${que}`) : null,
  };
}

async function fetchViajes(supabase: Supabase, id: string, f: FiltrosActividad): Promise<PaginaActividad<ViajeActividad>> {
  const { desde, hasta } = rango(f.pagina);
  let q = supabase
    .from("viajes")
    .select(
      "id, fecha_hora_salida, fecha_hora_llegada_est, numero_unidad, nombre_chofer, asientos_totales, asientos_disponibles, estado, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)",
      { count: "exact" }
    )
    .eq("cooperativa_id", id);
  if (f.estado) q = q.eq("estado", f.estado);
  q = conFechas(q, "fecha_hora_salida", f);
  const { data, count, error } = await q.order("fecha_hora_salida", { ascending: false }).range(desde, hasta);

  const filas = (data ?? []).map((v): ViajeActividad => {
    const ruta = uno(v.ruta as Uno<{ ciudad_origen: string; ciudad_destino: string }>);
    return {
      id: v.id,
      ciudad_origen: ruta?.ciudad_origen ?? "",
      ciudad_destino: ruta?.ciudad_destino ?? "",
      salida: v.fecha_hora_salida,
      llegada_estimada: v.fecha_hora_llegada_est,
      numero_unidad: v.numero_unidad ?? null,
      nombre_chofer: v.nombre_chofer ?? null,
      asientos_totales: Number(v.asientos_totales),
      asientos_disponibles: Number(v.asientos_disponibles),
      estado: v.estado,
    };
  });
  return pagina(filas, count, f, error, "los viajes");
}

async function fetchBoletos(supabase: Supabase, id: string, f: FiltrosActividad): Promise<PaginaActividad<BoletoActividad>> {
  const { desde, hasta } = rango(f.pagina);
  let q = supabase
    .from("boletos")
    .select(
      "id, codigo_boleto, asiento, precio, estado, pasajero_nombre, pasajero_cedula, created_at, viaje:viajes!viaje_id(fecha_hora_salida, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino))",
      { count: "exact" }
    )
    .eq("cooperativa_id", id);
  if (f.estado) q = q.eq("estado", f.estado);
  q = conFechas(q, "created_at", f);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(desde, hasta);

  type Viaje = { fecha_hora_salida: string; ruta: Uno<{ ciudad_origen: string; ciudad_destino: string }> };
  const filas = (data ?? []).map((b): BoletoActividad => {
    const viaje = uno(b.viaje as Uno<Viaje>);
    const ruta = uno(viaje?.ruta);
    return {
      id: b.id,
      codigo_boleto: b.codigo_boleto,
      asiento: b.asiento,
      precio: Number(b.precio),
      estado: b.estado,
      pasajero_nombre: b.pasajero_nombre ?? null,
      pasajero_cedula: b.pasajero_cedula ?? null,
      ciudad_origen: ruta?.ciudad_origen ?? null,
      ciudad_destino: ruta?.ciudad_destino ?? null,
      salida: viaje?.fecha_hora_salida ?? null,
      created_at: b.created_at,
    };
  });
  return pagina(filas, count, f, error, "los boletos");
}

async function fetchEncomiendas(
  supabase: Supabase,
  id: string,
  f: FiltrosActividad
): Promise<PaginaActividad<EncomiendaActividad>> {
  const { desde, hasta } = rango(f.pagina);
  let q = supabase
    .from("encomiendas")
    .select(
      "id, tracking_id, estado, ciudad_origen, ciudad_destino, remitente_nombre, receiver_nombre, costo_calculado, peso_kg, pin_bloqueado, created_at, sender:profiles!sender_id(nombre_completo)",
      { count: "exact" }
    )
    .eq("cooperativa_id", id);
  if (f.estado) q = q.eq("estado", f.estado);
  q = conFechas(q, "created_at", f);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(desde, hasta);

  const filas = (data ?? []).map((e): EncomiendaActividad => {
    const sender = uno(e.sender as Uno<{ nombre_completo: string }>);
    return {
      id: e.id,
      tracking_id: e.tracking_id,
      estado: e.estado,
      ciudad_origen: e.ciudad_origen,
      ciudad_destino: e.ciudad_destino,
      // Alta en taquilla: sender_id es el empleado y el remitente real va en remitente_nombre.
      remitente: e.remitente_nombre || sender?.nombre_completo || null,
      destinatario: e.receiver_nombre,
      costo: e.costo_calculado != null ? Number(e.costo_calculado) : null,
      peso_kg: e.peso_kg != null ? Number(e.peso_kg) : null,
      pin_bloqueado: Boolean(e.pin_bloqueado),
      created_at: e.created_at,
    };
  });
  return pagina(filas, count, f, error, "las encomiendas");
}

async function fetchPagos(supabase: Supabase, id: string, f: FiltrosActividad): Promise<PaginaActividad<PagoActividad>> {
  const { desde, hasta } = rango(f.pagina);
  let q = supabase
    .from("pagos")
    .select(
      "id, monto, monto_bs, moneda, tasa_bcv, tasa_bcv_fecha, tipo_pago, metodo_tipo, estado_verificacion, numero_referencia, created_at, encomienda:encomiendas(tracking_id), boleto:boletos!pagos_boleto_id_fkey(codigo_boleto), metodo:metodos_pago_cooperativa(tipo)",
      { count: "exact" }
    )
    .eq("cooperativa_id", id);
  if (f.estado) q = q.eq("estado_verificacion", f.estado);
  q = conFechas(q, "created_at", f);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(desde, hasta);

  const filas = (data ?? []).map((p): PagoActividad => {
    const encomienda = uno(p.encomienda as Uno<{ tracking_id: string }>);
    const boleto = uno(p.boleto as Uno<{ codigo_boleto: string }>);
    const metodo = uno(p.metodo as Uno<{ tipo: string }>);
    const estado = p.estado_verificacion;
    return {
      id: p.id,
      monto: Number(p.monto),
      monto_bs: p.monto_bs != null ? Number(p.monto_bs) : null,
      moneda: p.moneda === "USD" ? "USD" : "VES",
      tasa_bcv: p.tasa_bcv != null ? Number(p.tasa_bcv) : null,
      tasa_bcv_fecha: p.tasa_bcv_fecha ?? null,
      tipo_pago: p.tipo_pago,
      // pagos.metodo_tipo (punto de venta, efectivo…) y, en pagos sin esa columna, el tipo de la cuenta.
      metodo_tipo: p.metodo_tipo ?? metodo?.tipo ?? null,
      estado_verificacion: estado === "APROBADO" || estado === "RECHAZADO" ? estado : "PENDIENTE",
      numero_referencia: p.numero_referencia || null,
      boleto_codigo: boleto?.codigo_boleto ?? null,
      encomienda_tracking_id: encomienda?.tracking_id ?? null,
      created_at: p.created_at,
    };
  });
  return pagina(filas, count, f, error, "los pagos");
}

/** La lista de una pestaña ya paginada y filtrada (solo se llama con la pestaña abierta). */
export async function fetchActividadPestana(
  cooperativaId: string,
  pestana: PestanaActividad,
  filtros: FiltrosActividad
): Promise<ActividadPestana> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const vacia = <T,>(): PaginaActividad<T> => ({
    filas: [],
    total: 0,
    pagina: 1,
    porPagina: FILAS_ACTIVIDAD,
    error: null,
  });
  if (!esUuid(cooperativaId)) {
    return { tab: pestana, datos: vacia() } as ActividadPestana;
  }
  switch (pestana) {
    case "viajes":
      return { tab: "viajes", datos: await fetchViajes(supabase, cooperativaId, filtros) };
    case "boletos":
      return { tab: "boletos", datos: await fetchBoletos(supabase, cooperativaId, filtros) };
    case "encomiendas":
      return { tab: "encomiendas", datos: await fetchEncomiendas(supabase, cooperativaId, filtros) };
    case "pagos":
      return { tab: "pagos", datos: await fetchPagos(supabase, cooperativaId, filtros) };
  }
}
