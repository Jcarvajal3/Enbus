import { createClient, createAdminClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import type { Cooperativa } from "@/lib/types/admin-cooperativas";
import type { CuentaSolicitud, SolicitudesAdmin, SolicitudPendiente } from "@/lib/types/admin-solicitudes";

/**
 * Respaldo para solicitudes antiguas de la landing, que guardaban
 * "Representante: X. Mensaje: Y" en `descripcion` (la migración 20260720000002
 * ya las copia a las columnas nuevas; esto cubre la base sin migrar).
 */
function datosDeDescripcion(descripcion: string | null | undefined) {
  if (!descripcion || !descripcion.startsWith("Representante: ")) return { representante: null, mensaje: null };
  const resto = descripcion.slice("Representante: ".length);
  const corte = resto.indexOf(". Mensaje: ");
  const representante = (corte >= 0 ? resto.slice(0, corte) : resto).trim() || null;
  const mensaje = corte >= 0 ? resto.slice(corte + ". Mensaje: ".length).trim() || null : null;
  return { representante, mensaje };
}

type FilaInvitacion = {
  cooperativa_id: string;
  email: string;
  usado: boolean;
  expira_at: string;
  revocada_at?: string | null;
};

/**
 * Solicitudes de registro: en revisión (PENDIENTE) y rechazadas (RECHAZADA), con
 * el estado de la cuenta del administrador ("Ya creó su cuenta" / "Invitación
 * pendiente" / "Sin cuenta"). Lanza un error legible si la consulta falla.
 */
export async function fetchSolicitudes(): Promise<SolicitudesAdmin> {
  const supabase = await createClient();

  let resultado = await supabase
    .from("cooperativas")
    .select("*")
    .in("estado", ["PENDIENTE", "RECHAZADA"])
    .order("created_at", { ascending: false });

  // 22P02: el enum aún no tiene RECHAZADA (migración 20260720000001 sin aplicar).
  if (resultado.error?.code === "22P02") {
    resultado = await supabase
      .from("cooperativas")
      .select("*")
      .eq("estado", "PENDIENTE")
      .order("created_at", { ascending: false });
  }

  if (resultado.error) {
    console.error("[fetchSolicitudes] cooperativas:", resultado.error);
    throw new Error(humanizeError(resultado.error, "cargar las solicitudes"));
  }

  const cooperativas = (resultado.data ?? []) as Cooperativa[];
  if (cooperativas.length === 0) return { pendientes: [], rechazadas: [] };

  const ids = cooperativas.map((c) => c.id);
  // Service role: el super admin necesita ver todas las invitaciones y perfiles de la cooperativa.
  const admin = createAdminClient();
  const [perfilesRes, invitacionesRes] = await Promise.all([
    admin.from("profiles").select("id, cooperativa_id").in("cooperativa_id", ids).eq("role", "admin_cooperativa"),
    admin.from("invitaciones").select("*").in("cooperativa_id", ids).eq("usado", false),
  ]);
  // Si falla, la columna "Cuenta" sale como "Sin cuenta" y la lista se muestra igual.
  if (perfilesRes.error) console.error("[fetchSolicitudes] profiles:", perfilesRes.error);
  if (invitacionesRes.error) console.error("[fetchSolicitudes] invitaciones:", invitacionesRes.error);

  const conCuenta = new Set((perfilesRes.data ?? []).map((p) => p.cooperativa_id as string));
  const ahora = Date.now();
  const invitacionPendiente = new Map<string, string>();
  for (const inv of (invitacionesRes.data ?? []) as FilaInvitacion[]) {
    if (inv.usado || inv.revocada_at || new Date(inv.expira_at).getTime() <= ahora) continue;
    if (!invitacionPendiente.has(inv.cooperativa_id)) invitacionPendiente.set(inv.cooperativa_id, inv.email);
  }

  const solicitudes: SolicitudPendiente[] = cooperativas.map((c) => {
    const respaldo = datosDeDescripcion(c.descripcion);
    const cuenta: CuentaSolicitud = conCuenta.has(c.id)
      ? "CREADA"
      : invitacionPendiente.has(c.id)
        ? "INVITACION_PENDIENTE"
        : "SIN_CUENTA";
    return {
      ...c,
      representante: c.representante ?? respaldo.representante,
      mensaje_registro: c.mensaje_registro ?? respaldo.mensaje,
      cuenta,
      cuenta_email: invitacionPendiente.get(c.id) ?? null,
    };
  });

  return {
    pendientes: solicitudes.filter((s) => s.estado === "PENDIENTE"),
    rechazadas: solicitudes.filter((s) => s.estado === "RECHAZADA"),
  };
}

/** @deprecated usar fetchSolicitudes (incluye las rechazadas y el estado de la cuenta). */
export async function fetchSolicitudesPendientes(): Promise<SolicitudPendiente[]> {
  return (await fetchSolicitudes()).pendientes;
}

export async function countSolicitudesPendientes(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("cooperativas")
    .select("*", { count: "exact", head: true })
    .eq("estado", "PENDIENTE");

  if (error) {
    console.error("Error counting solicitudes pendientes:", error);
    return 0;
  }

  return count || 0;
}
