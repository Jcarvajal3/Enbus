"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";
import { telefonoParaGuardar, TELEFONO_ERROR } from "@/lib/ve";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_BUS_NO_ENCONTRADO = "No encontramos ese bus en tu cooperativa. Actualiza la página.";
const MSG_SOLO_ADMIN = "Solo el administrador de la cooperativa puede gestionar los buses.";
/** Mismo rango que acepta un viaje (chk_viajes_asientos). */
const ASIENTOS_MAX = 80;

export type CampoBus = "unidad" | "placa" | "asientos" | "chofer" | "telefono";

/** "Unidad 12", "U-045": sin espacios sobrantes, hasta 40 caracteres. */
function limpiarUnidad(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim().replace(/\s+/g, " ");
}

/** "ab-123-cd" → "AB123CD" (como se guarda); "" si está vacío. */
function limpiarPlaca(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Cliente y cooperativa del administrador (la RLS vuelve a exigirlo en la base). */
async function perfilAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Tu sesión expiró. Inicia sesión de nuevo." };
  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa" || !profile.cooperativa_id) {
    return { ok: false as const, error: MSG_SOLO_ADMIN };
  }
  return { ok: true as const, supabase, cooperativaId: profile.cooperativa_id as string };
}

/** Texto de un 23505 de `buses` según el índice: unidad o placa repetida. */
function mensajeRepetido(error: { message?: string; details?: string }, unidad: string, placa: string | null) {
  const texto = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (texto.includes("placa") && placa) {
    return { error: `Ya tienes un bus con la placa ${placa}.`, campo: "placa" as CampoBus };
  }
  return { error: `Ya tienes un bus con la unidad «${unidad}». Usa otro número.`, campo: "unidad" as CampoBus };
}

export async function guardarBus(
  formData: FormData,
  busId?: string
): Promise<{ success: true; error?: undefined; campo?: undefined } | { success?: undefined; error: string; campo?: CampoBus }> {
  if (busId !== undefined && !UUID_RE.test(busId ?? "")) return { error: MSG_BUS_NO_ENCONTRADO };
  const ctx = await perfilAdmin();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, cooperativaId } = ctx;

  const numero_unidad = limpiarUnidad(formData.get("numero_unidad"));
  const placaTexto = limpiarPlaca(formData.get("placa"));
  const asientos = Number(String(formData.get("asientos") ?? "").trim());
  const chofer_nombre = String(formData.get("chofer_nombre") ?? "").trim().replace(/\s+/g, " ") || null;
  const telefonoTexto = String(formData.get("chofer_telefono") ?? "").trim();
  const activo = formData.get("activo") === "on";

  if (!numero_unidad || !/[\p{L}\p{N}]/u.test(numero_unidad)) {
    return { error: "Escribe el número o nombre de la unidad, por ejemplo «Unidad 12».", campo: "unidad" };
  }
  if (numero_unidad.length > 40) {
    return { error: "El número de unidad puede tener hasta 40 caracteres.", campo: "unidad" };
  }
  if (placaTexto && !/^[A-Z0-9]{5,10}$/.test(placaTexto)) {
    return { error: "Revisa la placa: de 5 a 10 letras y números, por ejemplo AB123CD.", campo: "placa" };
  }
  if (!Number.isInteger(asientos) || asientos < 1 || asientos > ASIENTOS_MAX) {
    return { error: `El bus debe tener entre 1 y ${ASIENTOS_MAX} asientos.`, campo: "asientos" };
  }
  if (chofer_nombre && chofer_nombre.length > 80) {
    return { error: "El nombre del chofer puede tener hasta 80 caracteres.", campo: "chofer" };
  }
  const chofer_telefono = telefonoTexto ? telefonoParaGuardar(telefonoTexto) : null;
  if (telefonoTexto && !chofer_telefono) return { error: TELEFONO_ERROR, campo: "telefono" };

  const placa = placaTexto || null;
  const payload = { numero_unidad, placa, asientos, chofer_nombre, chofer_telefono, activo };

  if (busId) {
    const { data: filas, error } = await supabase
      .from("buses")
      .update(payload)
      .eq("id", busId)
      .eq("cooperativa_id", cooperativaId)
      .select("id");
    if (error) {
      if (error.code === "23505") return mensajeRepetido(error, numero_unidad, placa);
      console.error("[guardarBus] Error al actualizar:", error);
      return { error: humanizeError(error, "actualizar el bus") };
    }
    if (!filas || filas.length === 0) return { error: MSG_BUS_NO_ENCONTRADO };
  } else {
    const { error } = await supabase.from("buses").insert({ ...payload, cooperativa_id: cooperativaId });
    if (error) {
      if (error.code === "23505") return mensajeRepetido(error, numero_unidad, placa);
      console.error("[guardarBus] Error al crear:", error);
      return { error: humanizeError(error, "registrar el bus") };
    }
  }

  revalidatePath("/cooperativas/buses");
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/dashboard");
  return { success: true };
}

/**
 * Viajes del bus: `programados` = salidas futuras aún PROGRAMADO (siguen en pie si
 * se desactiva el bus); `total` = cualquier viaje (si hay alguno, no se puede borrar).
 */
export async function revisarViajesBus(
  busId: string
): Promise<{ programados: number; total: number; error?: undefined } | { error: string }> {
  if (!UUID_RE.test(busId ?? "")) return { error: MSG_BUS_NO_ENCONTRADO };
  const ctx = await perfilAdmin();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, cooperativaId } = ctx;

  const base = () =>
    supabase.from("viajes").select("id", { count: "exact", head: true }).eq("cooperativa_id", cooperativaId).eq("bus_id", busId);
  const [programados, total] = await Promise.all([
    base().eq("estado", "PROGRAMADO").gt("fecha_hora_salida", new Date().toISOString()),
    base(),
  ]);
  const error = programados.error ?? total.error;
  if (error) {
    console.error("[revisarViajesBus] Error:", error);
    return { error: humanizeError(error, "revisar los viajes del bus") };
  }
  return { programados: programados.count ?? 0, total: total.count ?? 0 };
}

export async function cambiarActivoBus(busId: string, activo: boolean) {
  if (!UUID_RE.test(busId ?? "")) return { error: MSG_BUS_NO_ENCONTRADO };
  const ctx = await perfilAdmin();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, cooperativaId } = ctx;

  const { data: filas, error } = await supabase
    .from("buses")
    .update({ activo: activo === true })
    .eq("id", busId)
    .eq("cooperativa_id", cooperativaId)
    .select("id");
  if (error) return { error: humanizeError(error, "cambiar el estado del bus") };
  if (!filas || filas.length === 0) return { error: MSG_BUS_NO_ENCONTRADO };

  revalidatePath("/cooperativas/buses");
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/dashboard");
  return { success: true };
}

/** Borra un bus sin viajes. Con viajes (aunque sean viejos) se desactiva en su lugar: los viajes lo citan. */
export async function eliminarBus(busId: string) {
  if (!UUID_RE.test(busId ?? "")) return { error: MSG_BUS_NO_ENCONTRADO };
  const ctx = await perfilAdmin();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, cooperativaId } = ctx;

  const { count, error: errorConteo } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_id", cooperativaId)
    .eq("bus_id", busId);
  if (errorConteo) return { error: humanizeError(errorConteo, "revisar los viajes del bus") };
  if ((count ?? 0) > 0) {
    return {
      error:
        count === 1
          ? "Este bus tiene 1 viaje registrado: no se puede eliminar. Desactívalo en su lugar."
          : `Este bus tiene ${count} viajes registrados: no se puede eliminar. Desactívalo en su lugar.`,
      conViajes: true,
    };
  }

  const { data: filas, error } = await supabase
    .from("buses")
    .delete()
    .eq("id", busId)
    .eq("cooperativa_id", cooperativaId)
    .select("id");
  if (error) return { error: humanizeError(error, "eliminar el bus") };
  if (!filas || filas.length === 0) return { error: MSG_BUS_NO_ENCONTRADO };

  revalidatePath("/cooperativas/buses");
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/dashboard");
  return { success: true };
}
