import { createClient, createAdminClient } from "@/lib/supabase/server";
import { leerCooperativasPrivadas } from "@/lib/supabase/cooperativas-privadas";
import { humanizeError } from "@/lib/errores";
import { requireSuperAdmin, esUuid } from "./admin-auth";
import { aCentavos, deCentavos, enLotes } from "./admin-consultas";
import type { 
  Cooperativa, 
  CooperativaDetalle, 
  Sucursal, 
  MetodoPago, 
  Ruta, 
  Empleado, 
  Calificacion 
} from "@/lib/types/admin-cooperativas";
import { aTarifa, type FilaTarifa } from "@/lib/types/tarifas";
import { MAX_HISTORIAL_TARIFAS } from "@/lib/data/cooperativa-tarifas";
import type { BusCooperativa } from "@/lib/types/admin-cooperativas";

export async function fetchCooperativas(filters?: { estado?: string; search?: string }): Promise<Cooperativa[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  // Sin comas, paréntesis ni comodines: romperían el filtro `or` de PostgREST (?search=a,b → error).
  const termino = (filters?.search ?? "").replace(/[,()*%\\"]/g, " ").trim().slice(0, 80);

  // Todas las columnas (comisión, RIF, contactos): por la RPC, no por la tabla.
  const { data, error } = await leerCooperativasPrivadas(supabase, (cooperativas) => {
    let query = cooperativas.select("*");
    if (filters?.estado && filters.estado !== "ALL") {
      query = query.eq("estado", filters.estado);
    }
    if (termino) {
      query = query.or(`nombre.ilike.%${termino}%,rif.ilike.%${termino}%`);
    }
    return query.order("nombre", { ascending: true });
  });

  if (error) {
    console.error("Error fetching cooperativas:", error);
    throw new Error(humanizeError(error, "cargar las cooperativas"));
  }

  return data as Cooperativa[];
}

/** "Unidad 2" antes que "Unidad 10". */
const ORDEN_UNIDAD = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Reseñas que se cargan en el detalle (las más recientes; el total sale de la cooperativa). */
export const MAX_CALIFICACIONES_DETALLE = 50;

export async function fetchCooperativaById(id: string): Promise<CooperativaDetalle | null> {
  // Antes de usar la service role: este detalle muestra métodos de pago y correos.
  await requireSuperAdmin();
  if (!esUuid(id)) return null;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // 1. Fetch basic cooperativa data
  const { data: cooperativa, error: coopError } = await leerCooperativasPrivadas(supabase, (cooperativas) =>
    cooperativas.select("*").eq("id", id).maybeSingle()
  );

  if (coopError) {
    // Un id mal formado (22P02) es "no existe"; cualquier otro error va a error.tsx con "Reintentar".
    console.error("Error fetching cooperativa:", coopError);
    if (coopError.code === "22P02") return null;
    throw new Error(humanizeError(coopError, "cargar la cooperativa"));
  }
  if (!cooperativa) return null;

  // 2. Fetch related data in parallel
  const [
    sucursalesResult,
    metodosResult,
    rutasResult,
    tarifasResult,
    profilesResult,
    calificacionesResult,
    comisionesResult,
    encomiendasResult,
    busesResult,
    viajesProximosResult,
  ] = await Promise.all([
    supabase.from("sucursales").select("*").eq("cooperativa_id", id).order("nombre", { ascending: true }),
    // Use adminSupabase to bypass RLS activo=true filter — super admin needs to see ALL methods
    adminSupabase.from("metodos_pago_cooperativa").select("*").eq("cooperativa_id", id).order("created_at", { ascending: true }),
    supabase.from("rutas").select("*").eq("cooperativa_id", id).order("created_at", { ascending: false }),
    supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("cooperativa_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORIAL_TARIFAS),
    supabase.from("profiles").select("id, nombre_completo, role, cooperativa_id, telefono, cedula_rif, created_at").eq("cooperativa_id", id).order("created_at", { ascending: false }),
    supabase
      .from("calificaciones")
      .select("*, profiles:usuario_id(nombre_completo)")
      .eq("cooperativa_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_CALIFICACIONES_DETALLE),
    supabase.from("comisiones_ciclo").select("monto_comision").eq("cooperativa_id", id).eq("pagado", false),
    supabase
      .from("encomiendas")
      .select("id", { count: "exact", head: true })
      .eq("cooperativa_id", id)
      .not("estado", "in", "(ENTREGADA,CANCELADA,DEVUELTA)"),
    supabase
      .from("buses")
      .select("id, numero_unidad, placa, asientos, chofer_nombre, chofer_telefono, activo, created_at")
      .eq("cooperativa_id", id)
      .limit(500),
    // Salidas programadas que aún no han salido, para contar las de cada unidad.
    supabase
      .from("viajes")
      .select("bus_id")
      .eq("cooperativa_id", id)
      .eq("estado", "PROGRAMADO")
      .gt("fecha_hora_salida", new Date().toISOString())
      .not("bus_id", "is", null)
      .limit(1000),
  ]);

  if (sucursalesResult.error) console.error("Error sucursales:", sucursalesResult.error);
  if (metodosResult.error) console.error("Error metodos:", metodosResult.error);
  if (rutasResult.error) console.error("Error rutas:", rutasResult.error);
  if (tarifasResult.error) console.error("Error tarifas:", tarifasResult.error);
  if (profilesResult.error) console.error("Error profiles:", profilesResult.error);
  if (calificacionesResult.error) console.error("Error calificaciones:", calificacionesResult.error);
  if (comisionesResult.error) console.error("Error comisiones:", comisionesResult.error);
  if (encomiendasResult.error) console.error("Error encomiendas:", encomiendasResult.error);
  if (busesResult.error) console.error("Error buses:", busesResult.error);
  if (viajesProximosResult.error) console.error("Error viajes por bus:", viajesProximosResult.error);

  const sucursales = (sucursalesResult.data || []) as Sucursal[];
  const metodos_pago = (metodosResult.data || []) as MetodoPago[];
  const rutas = (rutasResult.data || []) as Ruta[];

  const proximosPorBus = new Map<string, number>();
  for (const v of (viajesProximosResult.data || []) as { bus_id: string | null }[]) {
    if (v.bus_id) proximosPorBus.set(v.bus_id, (proximosPorBus.get(v.bus_id) ?? 0) + 1);
  }
  const buses = ((busesResult.data || []) as Omit<BusCooperativa, "viajes_proximos">[])
    .map((b): BusCooperativa => ({ ...b, viajes_proximos: proximosPorBus.get(b.id) ?? 0 }))
    // Activas primero; dentro, "Unidad 2" antes que "Unidad 10".
    .sort((a, b) => Number(b.activo) - Number(a.activo) || ORDEN_UNIDAD.compare(a.numero_unidad, b.numero_unidad));
  const tarifas = ((tarifasResult.data || []) as unknown as FilaTarifa[]).map(aTarifa);

  // Fetch auth user data only for the profiles we already have (targeted lookup, not full listUsers)
  const profileIds = (profilesResult.data || []).map((p) => p.id);
  // Una petición a Auth por empleado, con a lo sumo 10 a la vez.
  const authUserResults = await enLotes(profileIds, 10, (uid) =>
    adminSupabase.auth.admin.getUserById(uid).catch((error: unknown) => {
      console.error("Error auth user:", error);
      return { data: { user: null }, error: error as Error };
    })
  );
  const authUsersMap = new Map(
    authUserResults
      .filter((r) => !r.error && r.data?.user)
      .map((r) => [r.data!.user!.id, r.data!.user!])
  );


  interface CalificacionQueryRow {
    id: string;
    boleto_id: string;
    usuario_id: string;
    cooperativa_id: string;
    estrellas: number;
    comentario: string | null;
    created_at: string;
    profiles: { nombre_completo: string } | null;
  }

  // Merge profiles with targeted auth lookups to get email and banned status
  const empleados = (profilesResult.data || []).map((p): Empleado => {
    const authUser = authUsersMap.get(p.id);
    const isBanned = authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false;
    return {
      id: p.id,
      nombre_completo: p.nombre_completo,
      role: p.role as "taquillero" | "admin_cooperativa" | "super_admin",
      cooperativa_id: p.cooperativa_id,
      telefono: p.telefono,
      cedula_rif: p.cedula_rif,
      email: authUser?.email,
      isBanned,
      created_at: p.created_at
    };
  });

  const calificaciones = ((calificacionesResult.data || []) as unknown as CalificacionQueryRow[]).map((c): Calificacion => {
    return {
      id: c.id,
      boleto_id: c.boleto_id,
      usuario_id: c.usuario_id,
      cooperativa_id: c.cooperativa_id,
      estrellas: c.estrellas,
      comentario: c.comentario,
      created_at: c.created_at,
      usuario_nombre: c.profiles?.nombre_completo || "Usuario EnBus"
    };
  });

  const comisiones_pendientes = deCentavos(
    (comisionesResult.data || []).reduce((sum, item) => sum + aCentavos(item.monto_comision), 0)
  );

  return {
    ...cooperativa,
    sucursales,
    metodos_pago,
    rutas,
    buses,
    tarifas,
    empleados,
    calificaciones,
    comisiones_pendientes,
    ciclos_sin_pagar: (comisionesResult.data || []).length,
    encomiendas_en_curso: encomiendasResult.count ?? 0,
  } as CooperativaDetalle;
}
