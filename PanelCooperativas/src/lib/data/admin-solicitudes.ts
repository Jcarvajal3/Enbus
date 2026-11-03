import { createClient, createAdminClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { requireSuperAdmin } from "./admin-auth";
import { enLotes } from "./admin-consultas";
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
  // Antes de usar la service role (invitaciones y perfiles de todas las cooperativas).
  await requireSuperAdmin();
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
  // En grupos de 100 ids: con cientos de solicitudes rechazadas, un solo `.in()`
  // supera el largo máximo de la URL y la consulta falla entera.
  const admin = createAdminClient();
  const grupos: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) grupos.push(ids.slice(i, i + 100));
  const resultados = await enLotes(grupos, 4, (grupo) =>
    Promise.all([
      admin.from("profiles").select("id, cooperativa_id").in("cooperativa_id", grupo).eq("role", "admin_cooperativa"),
      admin
        .from("invitaciones")
        .select("cooperativa_id, email, usado, expira_at, revocada_at")
        .in("cooperativa_id", grupo)
        .eq("usado", false)
        .gt("expira_at", new Date().toISOString()),
    ])
  );
  const perfiles: { cooperativa_id: string | null }[] = [];
  const invitaciones: FilaInvitacion[] = [];
  for (const [perfilesRes, invitacionesRes] of resultados) {
    // Si falla, la columna "Cuenta" sale como "Sin cuenta" y la lista se muestra igual.
    if (perfilesRes.error) console.error("[fetchSolicitudes] profiles:", perfilesRes.error);
    if (invitacionesRes.error) console.error("[fetchSolicitudes] invitaciones:", invitacionesRes.error);
    perfiles.push(...((perfilesRes.data ?? []) as { cooperativa_id: string | null }[]));
    invitaciones.push(...((invitacionesRes.data ?? []) as FilaInvitacion[]));
  }

  const conCuenta = new Set(perfiles.map((p) => p.cooperativa_id as string));
  const ahora = Date.now();
  const invitacionPendiente = new Map<string, string>();
  for (const inv of invitaciones) {
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

export async function countSolicitudesPendientes(): Promise<number> {
  await requireSuperAdmin();
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
