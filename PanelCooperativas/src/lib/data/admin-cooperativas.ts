import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { 
  Cooperativa, 
  CooperativaDetalle, 
  Sucursal, 
  MetodoPago, 
  Ruta, 
  Empleado, 
  Calificacion 
} from "@/lib/types/admin-cooperativas";

export async function fetchCooperativas(filters?: { estado?: string; search?: string }): Promise<Cooperativa[]> {
  const supabase = await createClient();
  let query = supabase.from("cooperativas").select("*");

  if (filters?.estado && filters.estado !== "ALL") {
    query = query.eq("estado", filters.estado);
  }

  if (filters?.search) {
    query = query.or(`nombre.ilike.%${filters.search}%,rif.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order("nombre", { ascending: true });

  if (error) {
    console.error("Error fetching cooperativas:", error);
    throw new Error(error.message);
  }

  return data as Cooperativa[];
}

export async function fetchCooperativaById(id: string): Promise<CooperativaDetalle | null> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // 1. Fetch basic cooperativa data
  const { data: cooperativa, error: coopError } = await supabase
    .from("cooperativas")
    .select("*")
    .eq("id", id)
    .single();

  if (coopError || !cooperativa) {
    console.error("Error fetching cooperativa:", coopError);
    return null;
  }

  // 2. Fetch related data in parallel
  const [
    sucursalesResult,
    metodosResult,
    rutasResult,
    profilesResult,
    calificacionesResult,
    comisionesResult,
  ] = await Promise.all([
    supabase.from("sucursales").select("*").eq("cooperativa_id", id).order("nombre", { ascending: true }),
    // Use adminSupabase to bypass RLS activo=true filter — super admin needs to see ALL methods
    adminSupabase.from("metodos_pago_cooperativa").select("*").eq("cooperativa_id", id).order("created_at", { ascending: true }),
    supabase.from("rutas").select("*").eq("cooperativa_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, nombre_completo, role, cooperativa_id, telefono, cedula_rif, created_at").eq("cooperativa_id", id).order("created_at", { ascending: false }),
    supabase.from("calificaciones").select("*, profiles:usuario_id(nombre_completo)").eq("cooperativa_id", id).order("created_at", { ascending: false }),
    supabase.from("comisiones_ciclo").select("monto_comision").eq("cooperativa_id", id).eq("pagado", false),
  ]);

  if (sucursalesResult.error) console.error("Error sucursales:", sucursalesResult.error);
  if (metodosResult.error) console.error("Error metodos:", metodosResult.error);
  if (rutasResult.error) console.error("Error rutas:", rutasResult.error);
  if (profilesResult.error) console.error("Error profiles:", profilesResult.error);
  if (calificacionesResult.error) console.error("Error calificaciones:", calificacionesResult.error);
  if (comisionesResult.error) console.error("Error comisiones:", comisionesResult.error);

  const sucursales = (sucursalesResult.data || []) as Sucursal[];
  const metodos_pago = (metodosResult.data || []) as MetodoPago[];
  const rutas = (rutasResult.data || []) as Ruta[];

  // Fetch auth user data only for the profiles we already have (targeted lookup, not full listUsers)
  const profileIds = (profilesResult.data || []).map((p) => p.id);
  const authUserResults = await Promise.all(
    profileIds.map((uid) => adminSupabase.auth.admin.getUserById(uid))
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

  const comisiones_pendientes = (comisionesResult.data || []).reduce((sum, item) => sum + Number(item.monto_comision), 0);

  return {
    ...cooperativa,
    sucursales,
    metodos_pago,
    rutas,
    empleados,
    calificaciones,
    comisiones_pendientes
  } as CooperativaDetalle;
}
