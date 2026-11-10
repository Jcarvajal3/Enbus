import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { humanizeError } from "@/lib/errores";
import { hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import type { BusParaViaje } from "@/lib/types/operacion";
import { ViajesClient, type VistaViajes } from "./client";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "Unidad 2" antes que "Unidad 10". */
const ORDEN_UNIDAD = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const LIMITE_HISTORIAL = 100;
const LIMITE_LISTA = 300;
const SELECT_VIAJES =
  "*, ruta:rutas!ruta_id(estado_origen, ciudad_origen, estado_destino, ciudad_destino, precio_pasaje, duracion_estimada_min)";

function primero(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Viajes por pestaña (PC-43), en la URL: `?vista=hoy|proximos|historial` y, para
 * buscar un día concreto, `?fecha=YYYY-MM-DD` (hora de Venezuela).
 *   hoy        salidas de hoy y los viajes en curso, de la más temprana a la más tarde
 *   proximos   de mañana a 7 días, en orden ascendente
 *   historial  antes de hoy, de la más reciente a la más antigua (máx. 100)
 */
export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  const sp = await searchParams;
  const fechaParam = primero(sp.fecha) ?? "";
  const fecha = FECHA_RE.test(fechaParam) ? fechaParam : null;
  const vistaParam = primero(sp.vista);
  const vista: VistaViajes =
    vistaParam === "proximos" || vistaParam === "historial" ? vistaParam : "hoy";

  const supabase = await createClient();
  const hoy = hoyVE();
  const rangoHoy = rangoDiaVE(hoy);
  const finProximos = rangoDiaVE(sumarDiasVE(hoy, 7)).hasta;
  // PostgREST: los valores con ":" y "." van entre comillas dentro de or().
  const filtroHoy = `and(fecha_hora_salida.gte."${rangoHoy.desde}",fecha_hora_salida.lte."${rangoHoy.hasta}"),estado.eq.EN_CURSO`;

  const base = () => supabase.from("viajes").select(SELECT_VIAJES).eq("cooperativa_id", user.cooperativa_id);

  const consultaLista = () => {
    if (fecha) {
      const r = rangoDiaVE(fecha);
      return base()
        .gte("fecha_hora_salida", r.desde)
        .lte("fecha_hora_salida", r.hasta)
        .order("fecha_hora_salida", { ascending: true })
        .limit(LIMITE_LISTA);
    }
    if (vista === "proximos") {
      return base()
        .gt("fecha_hora_salida", rangoHoy.hasta)
        .lte("fecha_hora_salida", finProximos)
        .order("fecha_hora_salida", { ascending: true })
        .limit(LIMITE_LISTA);
    }
    if (vista === "historial") {
      return base()
        .lt("fecha_hora_salida", rangoHoy.desde)
        .order("fecha_hora_salida", { ascending: false })
        .limit(LIMITE_HISTORIAL);
    }
    return base().or(filtroHoy).order("fecha_hora_salida", { ascending: true }).limit(LIMITE_LISTA);
  };

  const esAdmin = user.role === "admin_cooperativa";
  const [rutasResult, viajesResult, hoyResult, busesResult] = await Promise.all([
    supabase
      .from("rutas")
      .select("id, estado_origen, ciudad_origen, ciudad_destino")
      .eq("cooperativa_id", user.cooperativa_id)
      .eq("activa", true),
    consultaLista(),
    // Conteo de la pestaña "Hoy ({n})"
    supabase
      .from("viajes")
      .select("id", { count: "exact", head: true })
      .eq("cooperativa_id", user.cooperativa_id)
      .or(filtroHoy),
    // Buses activos para "Programar viaje" y "Editar viaje" (solo el administrador programa).
    esAdmin
      ? supabase
          .from("buses")
          .select("id, numero_unidad, placa, asientos, chofer_nombre")
          .eq("cooperativa_id", user.cooperativa_id)
          .eq("activo", true)
          .limit(500)
      : Promise.resolve(null),
  ]);

  // Si falla la carga, la lista no se muestra vacía: el cliente enseña el error con "Reintentar".
  const error = viajesResult.error ?? rutasResult.error;
  if (error) console.error("[ViajesPage] Error al cargar viajes o rutas:", error);
  // Si fallan los buses, la lista se ve igual; el formulario de programar avisa del error.
  if (busesResult?.error) console.error("[ViajesPage] Error al cargar los buses:", busesResult.error);
  const viajes = viajesResult.data ?? [];
  const busesActivos = ((busesResult?.data ?? []) as BusParaViaje[]).sort((a, b) =>
    ORDEN_UNIDAD.compare(a.numero_unidad, b.numero_unidad)
  );

  return (
    <ViajesClient
      // Cambiar de pestaña o de día monta la lista de nuevo (sin filtros del cliente viejos).
      key={`${vista}:${fecha ?? ""}`}
      viajes={viajes}
      rutasActivas={rutasResult.data || []}
      busesActivos={busesActivos}
      errorBuses={busesResult?.error ? humanizeError(busesResult.error, "cargar los buses") : null}
      userRole={user.role}
      vista={vista}
      fecha={fecha}
      totalHoy={hoyResult.error ? null : hoyResult.count ?? 0}
      historialRecortado={!fecha && vista === "historial" && viajes.length >= LIMITE_HISTORIAL}
      errorCarga={error ? humanizeError(error, "cargar los viajes") : null}
    />
  );
}
