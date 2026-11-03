import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { humanizeError } from "@/lib/errores";
import { formatFechaHoraVE } from "@/lib/fechas";
import { cedulaParaGuardar, telefonoParaGuardar } from "@/lib/ve";
import { formatCiudad } from "@/lib/ciudades";
import { requireSuperAdmin, esUuid } from "./admin-auth";
import { enLotes } from "./admin-consultas";
import { MAX_FILAS_DETALLE_USUARIO } from "@/lib/types/admin-usuarios";
import type {
  BajaCuenta,
  FiltrosUsuarios,
  PaginaUsuarios,
  Usuario, 
  UsuarioDetalle, 
  EncomiendaUsuario, 
  BoletoUsuario, 
  PagoUsuario, 
  NotificacionUsuario 
} from "@/lib/types/admin-usuarios";

export const USUARIOS_POR_PAGINA = 50;

const ROLES_VALIDOS = ["user", "taquillero", "admin_cooperativa", "super_admin"];

/** bajas_cuenta no existe sin la migración 20260721000003: se trata como "sin bajas". */
function faltaTablaBajas(err: { code?: string } | null): boolean {
  return err?.code === "42P01" || err?.code === "PGRST205" || err?.code === "PGRST200";
}

/**
 * Condición `or` de PostgREST para buscar por nombre, cédula o teléfono. Además de lo
 * escrito, prueba la forma en que se guardan ("v12.345.678" → "V-12345678").
 * Sin comas, paréntesis ni comodines: romperían el filtro.
 */
function filtroBusqueda(q: string): string | null {
  const termino = q.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!termino) return null;
  const partes = [
    `nombre_completo.ilike.%${termino}%`,
    `cedula_rif.ilike.%${termino}%`,
    `telefono.ilike.%${termino}%`,
  ];
  const cedula = cedulaParaGuardar(termino);
  if (cedula && cedula !== termino) partes.push(`cedula_rif.ilike.%${cedula}%`);
  const telefono = telefonoParaGuardar(termino);
  if (telefono && telefono !== termino) partes.push(`telefono.ilike.%${telefono}%`);
  return partes.join(",");
}

type FilaBaja = BajaCuenta & { usuario_id: string };

/** Correo y suspensión de cada perfil (auth.users). Una cuenta ya borrada de Auth no tiene datos. */
async function datosAuth(ids: string[]): Promise<Map<string, User>> {
  const adminSupabase = createAdminClient();
  const mapa = new Map<string, User>();
  // Una petición a Auth por perfil (no hay consulta por lote): a lo sumo 10 a la vez.
  const resultados = await enLotes(ids, 10, (id) =>
    adminSupabase.auth.admin.getUserById(id).then(
      (r) => ({ ok: true as const, r }),
      (reason: unknown) => ({ ok: false as const, reason })
    )
  );
  resultados.forEach((x, i) => {
    if (x.ok && x.r.data?.user) mapa.set(ids[i], x.r.data.user);
    else if (!x.ok) console.error("[fetchUsuarios] auth:", x.reason);
  });
  return mapa;
}

/**
 * Usuarios con búsqueda y paginación en el servidor (`?q=&rol=&cooperativa=&pagina=`,
 * 50 por página). `vista: "bajas"` lista solo las cuentas eliminadas desde la app
 * cuyo acceso falta borrar.
 */
export async function fetchUsuarios(filtros: FiltrosUsuarios = {}): Promise<PaginaUsuarios> {
  // Antes de usar la service role (correos y suspensiones de Auth).
  await requireSuperAdmin();
  const supabase = await createClient();
  const porPagina = USUARIOS_POR_PAGINA;
  const pagina = Math.max(1, Math.floor(Number(filtros.pagina) || 1));
  const desde = (pagina - 1) * porPagina;

  // Bajas por completar: conteo para el filtro y, en esa vista, la lista de ids.
  // Hasta 300 ids (más alargarían la URL del `.in()` por encima del límite); el
  // conteo es el total real.
  const { data: bajasPend, error: bajasError, count: totalBajas } = await supabase
    .from("bajas_cuenta")
    .select("usuario_id", { count: "exact" })
    .is("auth_eliminada_at", null)
    .order("solicitada_at", { ascending: true })
    .limit(300);
  if (bajasError && !faltaTablaBajas(bajasError)) {
    console.error("Error fetching bajas_cuenta:", bajasError);
  }
  const idsBajas = ((bajasPend ?? []) as { usuario_id: string }[]).map((b) => b.usuario_id);
  const bajasPendientes = Math.max(totalBajas ?? 0, idsBajas.length);

  if (filtros.vista === "bajas" && idsBajas.length === 0) {
    return { usuarios: [], total: 0, pagina: 1, porPagina, bajasPendientes };
  }

  let query = supabase
    .from("profiles")
    .select("*, cooperativas(nombre)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1);

  if (filtros.rol && ROLES_VALIDOS.includes(filtros.rol)) query = query.eq("role", filtros.rol);
  if (filtros.cooperativa && /^[0-9a-f-]{36}$/i.test(filtros.cooperativa)) {
    query = query.eq("cooperativa_id", filtros.cooperativa);
  }
  const busqueda = filtroBusqueda(filtros.q ?? "");
  if (busqueda) query = query.or(busqueda);
  if (filtros.vista === "bajas") query = query.in("id", idsBajas);

  const { data: profiles, error: profilesError, count } = await query;

  if (profilesError) {
    // Una página fuera de rango (PGRST103) no es un error: no hay filas.
    if (profilesError.code === "PGRST103") {
      return { usuarios: [], total: count ?? 0, pagina, porPagina, bajasPendientes };
    }
    console.error("Error fetching profiles:", profilesError);
    throw new Error(humanizeError(profilesError, "cargar los usuarios"));
  }

  const filas = profiles ?? [];
  const ids = filas.map((p) => p.id as string);

  const [auth, bajasRes] = await Promise.all([
    datosAuth(ids),
    ids.length
      ? supabase.from("bajas_cuenta").select("usuario_id, email, motivo, solicitada_at, auth_eliminada_at").in("usuario_id", ids)
      : Promise.resolve({ data: [] as FilaBaja[], error: null }),
  ]);
  if (bajasRes.error && !faltaTablaBajas(bajasRes.error)) console.error("Error fetching bajas:", bajasRes.error);
  const bajas = new Map(((bajasRes.data ?? []) as FilaBaja[]).map((b) => [b.usuario_id, b]));

  const usuarios: Usuario[] = filas.map((p) => {
    const authUser = auth.get(p.id);
    const baja = bajas.get(p.id);
    return {
      id: p.id,
      role: p.role,
      nombre_completo: p.nombre_completo,
      telefono: p.telefono,
      cedula_rif: p.cedula_rif,
      cooperativa_id: p.cooperativa_id || null,
      cooperativa_nombre: p.cooperativas?.nombre || null,
      email: authUser?.email || baja?.email || undefined,
      is_banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
      created_at: p.created_at,
      notif_encomiendas: p.notif_encomiendas ?? true,
      notif_boletos: p.notif_boletos ?? true,
      notif_recordatorios: p.notif_recordatorios ?? true,
      has_push_token: Boolean(p.expo_push_token),
      eliminada_at: p.eliminada_at ?? null,
      baja: baja
        ? { email: baja.email, motivo: baja.motivo, solicitada_at: baja.solicitada_at, auth_eliminada_at: baja.auth_eliminada_at }
        : null,
    };
  });

  return { usuarios, total: count ?? usuarios.length, pagina, porPagina, bajasPendientes };
}

export async function fetchUsuarioById(id: string): Promise<UsuarioDetalle | null> {
  await requireSuperAdmin();
  if (!esUuid(id)) return null;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const MAX = MAX_FILAS_DETALLE_USUARIO;

  // 1. Fetch basic profile data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*, cooperativas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    // Un id mal formado (22P02) es "no existe"; cualquier otro error va a error.tsx con "Reintentar".
    console.error("Error fetching profile:", profileError);
    if (profileError.code === "22P02") return null;
    throw new Error(humanizeError(profileError, "cargar el usuario"));
  }
  if (!profile) return null;

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

  // Recibidas: por usuario vinculado o por su teléfono. El teléfono va entre comillas
  // dobles: con comas o paréntesis rompería el filtro `or` de PostgREST.
  const telefono = String(profile.telefono ?? "").replace(/["\\]/g, "");
  const filtroRecibidas = telefono
    ? `receiver_user_id.eq.${id},receiver_telefono.eq."${telefono}"`
    : `receiver_user_id.eq.${id}`;

  // 3. Las listas de movimientos (las más recientes de cada una), en paralelo.
  const [
    enviadasResult,
    recibidasResult,
    boletosResult,
    pagosResult,
    notificacionesResult,
    bajaResult,
  ] = await Promise.all([
    supabase
      .from("encomiendas")
      .select("*, cooperativas(nombre)", { count: "exact" })
      .eq("sender_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("encomiendas")
      .select("*, cooperativas(nombre), profiles:sender_id(nombre_completo, telefono)", { count: "exact" })
      .or(filtroRecibidas)
      .order("created_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("boletos")
      .select("*, cooperativas(nombre), viajes(*, rutas(*))", { count: "exact" })
      .eq("comprador_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("pagos")
      .select("*, encomiendas(tracking_id), boletos!pagos_boleto_id_fkey(codigo_boleto), metodo:metodos_pago_cooperativa(tipo)", { count: "exact" })
      .eq("pagador_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("notificaciones_log")
      .select("*", { count: "exact" })
      .eq("destinatario_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("bajas_cuenta")
      .select("email, motivo, solicitada_at, auth_eliminada_at")
      .eq("usuario_id", id)
      .maybeSingle(),
  ]);
  if (bajaResult.error && !faltaTablaBajas(bajaResult.error)) console.error("Error baja:", bajaResult.error);
  const baja = (bajaResult.data ?? null) as BajaCuenta | null;

  // Una pestaña vacía por error se ve igual que "sin datos": al menos queda en el log.
  if (enviadasResult.error) console.error("Error encomiendas enviadas:", enviadasResult.error);
  if (recibidasResult.error) console.error("Error encomiendas recibidas:", recibidasResult.error);
  if (boletosResult.error) console.error("Error boletos:", boletosResult.error);
  if (pagosResult.error) console.error("Error pagos:", pagosResult.error);
  if (notificacionesResult.error) console.error("Error notificaciones:", notificacionesResult.error);

  const encomiendas_enviadas: EncomiendaUsuario[] = (enviadasResult.data || []).map((e) => ({
    id: e.id,
    tracking_id: e.tracking_id,
    receiver_nombre: e.receiver_nombre,
    receiver_telefono: e.receiver_telefono,
    receiver_cedula_rif: e.receiver_cedula_rif,
    estado: e.estado,
    peso_kg: e.peso_kg ? Number(e.peso_kg) : null,
    costo_calculado: Number(e.costo_calculado),
    tiene_pin: Boolean(e.pin_retiro),
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
    // Alta en taquilla: sender_id es el empleado; el remitente real va en remitente_*.
    sender_nombre: e.remitente_nombre || e.profiles?.nombre_completo || "Sin dato",
    sender_telefono: e.remitente_telefono || e.profiles?.telefono || "",
    estado: e.estado,
    peso_kg: e.peso_kg ? Number(e.peso_kg) : null,
    costo_calculado: Number(e.costo_calculado),
    tiene_pin: Boolean(e.pin_retiro),
    pin_bloqueado: e.pin_bloqueado,
    intentos_pin: e.intentos_pin,
    cooperativa_nombre: e.cooperativas?.nombre || "N/A",
    created_at: e.created_at
  }));

  const boletos: BoletoUsuario[] = (boletosResult.data || []).map((b) => {
    const origen = formatCiudad(b.viajes?.rutas?.ciudad_origen);
    const destino = formatCiudad(b.viajes?.rutas?.ciudad_destino);
    const fechaSalida = b.viajes?.fecha_hora_salida ? formatFechaHoraVE(b.viajes.fecha_hora_salida) : "";
    return {
      id: b.id,
      codigo_boleto: b.codigo_boleto,
      asiento: b.asiento,
      precio: Number(b.precio),
      estado: b.estado,
      cooperativa_nombre: b.cooperativas?.nombre || "N/A",
      viaje_info: origen && destino ? `${origen} → ${destino}${fechaSalida ? ` · ${fechaSalida}` : ""}` : "Sin datos del viaje",
      created_at: b.created_at
    };
  });

  const pagos: PagoUsuario[] = (pagosResult.data || []).map((p) => ({
    id: p.id,
    encomienda_tracking_id: p.encomiendas?.tracking_id || null,
    boleto_codigo: p.boletos?.codigo_boleto || null,
    monto: Number(p.monto),
    monto_bs: p.monto_bs != null ? Number(p.monto_bs) : null,
    moneda: p.moneda === "USD" ? "USD" : "VES",
    tasa_bcv: p.tasa_bcv != null ? Number(p.tasa_bcv) : null,
    tasa_bcv_fecha: p.tasa_bcv_fecha ?? null,
    tipo_pago: p.tipo_pago,
    metodo_tipo: (Array.isArray(p.metodo) ? p.metodo[0]?.tipo : p.metodo?.tipo) ?? null,
    verificado: p.verificado,
    // Antes de la migración 01 no existe estado_verificacion: se deduce de verificado / rechazado_at.
    estado_verificacion:
      p.estado_verificacion === "APROBADO" || p.estado_verificacion === "RECHAZADO" || p.estado_verificacion === "PENDIENTE"
        ? p.estado_verificacion
        : p.verificado
          ? "APROBADO"
          : p.rechazado_at
            ? "RECHAZADO"
            : "PENDIENTE",
    motivo_rechazo: p.motivo_rechazo ?? null,
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
    email: authUser?.email || baja?.email || undefined,
    is_banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
    created_at: profile.created_at,
    eliminada_at: profile.eliminada_at ?? null,
    baja,
    notif_encomiendas: profile.notif_encomiendas ?? true,
    notif_boletos: profile.notif_boletos ?? true,
    notif_recordatorios: profile.notif_recordatorios ?? true,
    has_push_token: Boolean(profile.expo_push_token),
    encomiendas_enviadas,
    encomiendas_recibidas,
    boletos,
    pagos,
    notificaciones,
    totales: {
      encomiendas_enviadas: enviadasResult.count ?? encomiendas_enviadas.length,
      encomiendas_recibidas: recibidasResult.count ?? encomiendas_recibidas.length,
      boletos: boletosResult.count ?? boletos.length,
      pagos: pagosResult.count ?? pagos.length,
      notificaciones: notificacionesResult.count ?? notificaciones.length,
    },
  };
}
