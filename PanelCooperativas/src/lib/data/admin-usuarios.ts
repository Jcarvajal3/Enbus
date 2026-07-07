import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { 
  Usuario, 
  UsuarioDetalle, 
  EncomiendaUsuario, 
  BoletoUsuario, 
  PagoUsuario, 
  NotificacionUsuario 
} from "@/lib/types/admin-usuarios";

export async function fetchUsuarios(filters?: { 
  role?: string; 
  cooperativa_id?: string; 
  search?: string; 
}): Promise<Usuario[]> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // 1. Fetch profiles from database
  let query = supabase
    .from("profiles")
    .select("*, cooperativas(nombre)")
    .order("created_at", { ascending: false })
    .limit(500); // Safeguard: paginate if user base grows beyond this

  if (filters?.role && filters.role !== "ALL") {
    query = query.eq("role", filters.role);
  }

  if (filters?.cooperativa_id && filters.cooperativa_id !== "ALL") {
    query = query.eq("cooperativa_id", filters.cooperativa_id);
  }

  const { data: profiles, error: profilesError } = await query;

  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    throw new Error(profilesError.message);
  }

  // 2. Fetch auth users to map emails and banned status
  let authUsers: User[] = [];
  try {
    const authUsersResult = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
    authUsers = authUsersResult.data?.users || [];
  } catch (err) {
    console.error("Error listing auth users:", err);
  }

  // 3. Merge profiles and auth users
  // NOTE: listUsers({ perPage: 1000 }) is a hard cap. For >1000 users,
  // implement cursor-based pagination via listUsers({ page, perPage }).
  let usuarios: Usuario[] = (profiles || []).map((p) => {
    const authUser = authUsers.find((u) => u.id === p.id);
    return {
      id: p.id,
      role: p.role,
      nombre_completo: p.nombre_completo,
      telefono: p.telefono,
      cedula_rif: p.cedula_rif,
      cooperativa_id: p.cooperativa_id || null,
      cooperativa_nombre: p.cooperativas?.nombre || null,
      email: authUser?.email || undefined,
      is_banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
      created_at: p.created_at,
      notif_encomiendas: p.notif_encomiendas ?? true,
      notif_boletos: p.notif_boletos ?? true,
      notif_recordatorios: p.notif_recordatorios ?? true,
      has_push_token: Boolean(p.expo_push_token),
    };
  });

  // 4. In-memory filter for search query (name, phone, RIF/cédula, and email)
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    usuarios = usuarios.filter((u) => 
      u.nombre_completo.toLowerCase().includes(searchLower) ||
      u.telefono.toLowerCase().includes(searchLower) ||
      u.cedula_rif.toLowerCase().includes(searchLower) ||
      (u.email && u.email.toLowerCase().includes(searchLower))
    );
  }

  return usuarios;
}

export async function fetchUsuarioById(id: string): Promise<UsuarioDetalle | null> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // 1. Fetch basic profile data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*, cooperativas(nombre)")
    .eq("id", id)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching profile:", profileError);
    return null;
  }

  // 2. Fetch auth user to get email and banned status
  let authUser: User | null = null;
  try {
    const { data: authUserData, error: authUserError } = await adminSupabase.auth.admin.getUserById(id);
    if (!authUserError && authUserData) {
      authUser = authUserData.user;
    }
  } catch (err) {
    console.error("Error fetching auth user:", err);
  }

  // 3. Fetch all transaction logs in parallel to optimize speed
  const [
    enviadasResult,
    recibidasResult,
    boletosResult,
    pagosResult,
    notificacionesResult
  ] = await Promise.all([
    supabase
      .from("encomiendas")
      .select("*, cooperativas(nombre)")
      .eq("sender_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("encomiendas")
      .select("*, cooperativas(nombre), profiles:sender_id(nombre_completo, telefono)")
      .or(`receiver_user_id.eq.${id},receiver_telefono.eq.${profile.telefono}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("boletos")
      .select("*, cooperativas(nombre), viajes(*, rutas(*))")
      .eq("comprador_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pagos")
      .select("*, encomiendas(tracking_id), boletos(codigo_boleto)")
      .eq("pagador_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("notificaciones_log")
      .select("*")
      .eq("destinatario_id", id)
      .order("created_at", { ascending: false })
  ]);

  const encomiendas_enviadas: EncomiendaUsuario[] = (enviadasResult.data || []).map((e) => ({
    id: e.id,
    tracking_id: e.tracking_id,
    receiver_nombre: e.receiver_nombre,
    receiver_telefono: e.receiver_telefono,
    receiver_cedula_rif: e.receiver_cedula_rif,
    estado: e.estado,
    peso_kg: e.peso_kg ? Number(e.peso_kg) : null,
    costo_calculado: Number(e.costo_calculado),
    pin_retiro: e.pin_retiro,
    pin_bloqueado: e.pin_bloqueado,
    intentos_pin: e.intentos_pin,
    cooperativa_nombre: e.cooperativas?.nombre || "N/A",
    created_at: e.created_at
  }));

  const encomiendas_recibidas: EncomiendaUsuario[] = (recibidasResult.data || []).map((e) => ({
    id: e.id,
    tracking_id: e.tracking_id,
    receiver_nombre: e.receiver_nombre,
    receiver_telefono: e.receiver_telefono,
    receiver_cedula_rif: e.receiver_cedula_rif,
    sender_nombre: e.profiles?.nombre_completo || "Desconocido",
    sender_telefono: e.profiles?.telefono || "",
    estado: e.estado,
    peso_kg: e.peso_kg ? Number(e.peso_kg) : null,
    costo_calculado: Number(e.costo_calculado),
    pin_retiro: e.pin_retiro,
    pin_bloqueado: e.pin_bloqueado,
    intentos_pin: e.intentos_pin,
    cooperativa_nombre: e.cooperativas?.nombre || "N/A",
    created_at: e.created_at
  }));

  const boletos: BoletoUsuario[] = (boletosResult.data || []).map((b) => {
    const origen = b.viajes?.rutas?.ciudad_origen || "";
    const destino = b.viajes?.rutas?.ciudad_destino || "";
    const fechaSalida = b.viajes?.fecha_hora_salida 
      ? new Date(b.viajes.fecha_hora_salida).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) 
      : "";
    return {
      id: b.id,
      codigo_boleto: b.codigo_boleto,
      asiento: b.asiento,
      precio: Number(b.precio),
      estado: b.estado,
      cooperativa_nombre: b.cooperativas?.nombre || "N/A",
      viaje_info: origen && destino ? `${origen} -> ${destino} (${fechaSalida})` : "Viaje N/A",
      created_at: b.created_at
    };
  });

  const pagos: PagoUsuario[] = (pagosResult.data || []).map((p) => ({
    id: p.id,
    encomienda_tracking_id: p.encomiendas?.tracking_id || null,
    boleto_codigo: p.boletos?.codigo_boleto || null,
    monto: Number(p.monto),
    tipo_pago: p.tipo_pago,
    verificado: p.verificado,
    numero_referencia: p.numero_referencia || null,
    created_at: p.created_at
  }));

  const notificaciones: NotificacionUsuario[] = (notificacionesResult.data || []).map((n) => ({
    id: n.id,
    titulo: n.titulo || `Template: ${n.canal}`,
    contenido: n.contenido,
    canal: n.canal,
    estado_envio: n.estado_envio,
    created_at: n.created_at
  }));

  return {
    id: profile.id,
    role: profile.role,
    nombre_completo: profile.nombre_completo,
    telefono: profile.telefono,
    cedula_rif: profile.cedula_rif,
    cooperativa_id: profile.cooperativa_id || null,
    cooperativa_nombre: profile.cooperativas?.nombre || null,
    email: authUser?.email || undefined,
    is_banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
    created_at: profile.created_at,
    notif_encomiendas: profile.notif_encomiendas ?? true,
    notif_boletos: profile.notif_boletos ?? true,
    notif_recordatorios: profile.notif_recordatorios ?? true,
    has_push_token: Boolean(profile.expo_push_token),
    encomiendas_enviadas,
    encomiendas_recibidas,
    boletos,
    pagos,
    notificaciones
  };
}
