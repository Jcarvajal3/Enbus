"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { formatCiudad } from "@/lib/ciudades";
import { vaASucursal, type SucursalRecepcion } from "./sucursal";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Máximo por lote: cada id va en la URL de `in()` (200 ≈ 7,5 KB, dentro del límite del gateway). */
const MAX_LOTE = 200;

type Alcance =
  | { ok: true; cooperativaId: string; sucursal: SucursalRecepcion | null }
  | { ok: false; error: string };

/**
 * Sucursal del usuario actual, leída de `profiles.sucursal_id` con la sesión normal
 * (sin cliente de servicio). Solo el taquillero recibe por sucursal; el administrador
 * de la cooperativa, o un taquillero sin sucursal, ve toda la cooperativa (null).
 */
async function obtenerAlcance(supabase: SupabaseServer): Promise<Alcance> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Inicia sesión de nuevo para continuar." };

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("cooperativa_id, role, sucursal_id")
    .eq("id", user.id)
    .single();

  if (perfilError) console.error("Error al leer el perfil para la recepción:", perfilError);
  if (!profile?.cooperativa_id) {
    return { ok: false, error: "Tu usuario no está asociado a una cooperativa. Avísale al administrador." };
  }

  let sucursal: SucursalRecepcion | null = null;
  if (profile.role === "taquillero" && profile.sucursal_id) {
    const { data, error } = await supabase
      .from("sucursales")
      .select("id, nombre, ciudad, estado_geografico")
      .eq("id", profile.sucursal_id)
      .eq("cooperativa_id", profile.cooperativa_id)
      .maybeSingle();
    if (error) console.error("Error al leer la sucursal del usuario:", error);
    sucursal = (data as SucursalRecepcion | null) ?? null;
  }

  return { ok: true, cooperativaId: profile.cooperativa_id, sucursal };
}

function revalidarRecepcion() {
  revalidatePath("/cooperativas/recepcion-destino");
  revalidatePath("/cooperativas/entrega");
  revalidatePath("/cooperativas/dashboard");
}

/** Sucursal en la que recibe el usuario actual (null = toda la cooperativa). */
export async function obtenerSucursalRecepcion() {
  const supabase = await createClient();
  const alcance = await obtenerAlcance(supabase);
  if (!alcance.ok) return { sucursal: null, error: alcance.error };
  return { sucursal: alcance.sucursal };
}

type EncomiendaDestino = {
  id: string;
  tracking_id: string;
  estado: string;
  cooperativa_id: string | null;
  sucursal_destino_id: string | null;
  ciudad_destino: string;
};

function mensajeOtraSucursal(encomiendas: EncomiendaDestino[], sucursal: SucursalRecepcion) {
  if (encomiendas.length === 1) {
    const e = encomiendas[0];
    return `La encomienda ${e.tracking_id} va a ${formatCiudad(e.ciudad_destino)}, no a tu sucursal ${sucursal.nombre} (${formatCiudad(sucursal.ciudad)}). No la recibas aquí: debe seguir hasta su destino.`;
  }
  const lista = encomiendas.slice(0, 3).map((e) => e.tracking_id).join(", ");
  const resto = encomiendas.length > 3 ? ` y ${encomiendas.length - 3} más` : "";
  return `No se recibió nada: ${encomiendas.length} encomiendas (${lista}${resto}) van a otra sucursal, no a ${sucursal.nombre}. Quítalas de la selección e intenta de nuevo.`;
}

export async function recibirEncomienda(encomiendaId: string) {
  if (!UUID_RE.test(encomiendaId ?? "")) {
    return { success: false, error: "No encontramos esta encomienda en tu cooperativa. Revisa el código e intenta de nuevo." };
  }
  try {
    const supabase = await createClient();
    const alcance = await obtenerAlcance(supabase);
    if (!alcance.ok) return { success: false, error: alcance.error };

    const { data, error: lecturaError } = await supabase
      .from("encomiendas")
      .select("id, tracking_id, estado, cooperativa_id, sucursal_destino_id, ciudad_destino")
      .eq("id", encomiendaId)
      .maybeSingle();

    if (lecturaError) {
      console.error("Error al leer la encomienda a recibir:", lecturaError);
      return { success: false, error: humanizeError(lecturaError, "recibir la encomienda") };
    }
    const encomienda = data as EncomiendaDestino | null;
    if (!encomienda || encomienda.cooperativa_id !== alcance.cooperativaId) {
      return { success: false, error: "No encontramos esta encomienda en tu cooperativa. Revisa el código e intenta de nuevo." };
    }
    if (alcance.sucursal && !vaASucursal(encomienda, alcance.sucursal)) {
      return { success: false, error: mensajeOtraSucursal([encomienda], alcance.sucursal) };
    }
    if (encomienda.estado !== "EN_TRANSITO") {
      return { success: false, error: "Esta encomienda no está en camino: ya fue recibida o todavía no se despachó." };
    }

    const { data: recibidas, error } = await supabase
      .from("encomiendas")
      .update({ estado: "EN_OFICINA_DESTINO" })
      .eq("id", encomiendaId)
      .eq("estado", "EN_TRANSITO") // Safety check
      .select("id");

    // Notificaciones al destinatario (Push + WhatsApp con PIN)
    // se disparan via trigger/Edge Function automáticamente

    if (error) {
      console.error("Error al recibir encomienda:", error);
      return { success: false, error: humanizeError(error, "recibir la encomienda") };
    }
    if (!recibidas || recibidas.length === 0) {
      return { success: false, error: "Esta encomienda ya fue recibida. Actualiza la lista." };
    }

    revalidarRecepcion();
    return { success: true };
  } catch (err) {
    console.error("Error inesperado en recibirEncomienda:", err);
    return { success: false, error: humanizeError(err, "recibir la encomienda") };
  }
}

export async function recibirLote(encomiendaIds: string[]) {
  try {
    const idsPedidos = Array.from(
      new Set((Array.isArray(encomiendaIds) ? encomiendaIds : []).filter((id) => UUID_RE.test(id ?? "")))
    );
    if (!idsPedidos.length) {
      return { success: false, count: 0, error: "Selecciona al menos una encomienda." };
    }
    if (idsPedidos.length > MAX_LOTE) {
      return { success: false, count: 0, error: `Recibe como máximo ${MAX_LOTE} encomiendas a la vez.` };
    }

    const supabase = await createClient();
    const alcance = await obtenerAlcance(supabase);
    if (!alcance.ok) return { success: false, count: 0, error: alcance.error };

    const { data: encomiendas, error: lecturaError } = await supabase
      .from("encomiendas")
      .select("id, tracking_id, estado, cooperativa_id, sucursal_destino_id, ciudad_destino")
      .eq("cooperativa_id", alcance.cooperativaId)
      .in("id", idsPedidos);

    if (lecturaError) {
      console.error("Error al leer el lote a recibir:", lecturaError);
      return { success: false, count: 0, error: humanizeError(lecturaError, "recibir el lote") };
    }

    const delaCooperativa = ((encomiendas ?? []) as EncomiendaDestino[]).filter((e) => e.cooperativa_id === alcance.cooperativaId);
    if (alcance.sucursal) {
      const sucursal = alcance.sucursal;
      const ajenas = delaCooperativa.filter((e) => !vaASucursal(e, sucursal));
      if (ajenas.length > 0) {
        return { success: false, count: 0, error: mensajeOtraSucursal(ajenas, sucursal) };
      }
    }

    const ids = delaCooperativa.map((e) => e.id);
    if (ids.length === 0) {
      return { success: false, count: 0, error: "No encontramos esas encomiendas en tu cooperativa. Actualiza la lista e intenta de nuevo." };
    }

    const { data: recibidas, error } = await supabase
      .from("encomiendas")
      .update({ estado: "EN_OFICINA_DESTINO" })
      .in("id", ids)
      .eq("estado", "EN_TRANSITO")
      .select("id");

    if (error) {
      console.error("Error al recibir lote:", error);
      return { success: false, count: 0, error: humanizeError(error, "recibir el lote") };
    }

    revalidarRecepcion();
    return { success: true, count: recibidas?.length ?? 0 };
  } catch (err) {
    console.error("Error inesperado en recibirLote:", err);
    return { success: false, count: 0, error: humanizeError(err, "recibir el lote") };
  }
}
