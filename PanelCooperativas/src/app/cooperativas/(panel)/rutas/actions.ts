"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";
import { formatCiudad, mismaCiudad, terminalVE, terminalesParaSalir } from "@/lib/ciudades";

const MSG_MISMA_CIUDAD = "El origen y el destino deben ser ciudades distintas.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_RUTA_NO_ENCONTRADA = "No encontramos esa ruta en tu cooperativa. Actualiza la página.";
/** Tope razonable del pasaje en USD (evita un error de tipeo como 1500 en vez de 15,00). */
const PRECIO_MAXIMO_USD = 1000;

/** Duración en minutos: "Horas" (0–48) + "Minutos" (0–59), o el campo antiguo en minutos. */
function leerDuracion(formData: FormData): number {
  const horasTxt = formData.get("duracion_horas");
  const minutosTxt = formData.get("duracion_minutos");
  if (horasTxt !== null || minutosTxt !== null) {
    const horas = String(horasTxt ?? "").trim() === "" ? 0 : Number(horasTxt);
    const minutos = String(minutosTxt ?? "").trim() === "" ? 0 : Number(minutosTxt);
    if (!Number.isInteger(horas) || horas < 0 || horas > 48) return NaN;
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > 59) return NaN;
    return horas * 60 + minutos;
  }
  return parseInt(String(formData.get("duracion_estimada_min") ?? ""), 10);
}

/** "15,50" | "15.50" | "1.250,00" -> número (NaN si no es válido). */
function parsePrecio(valor: FormDataEntryValue | null): number {
  const texto = String(valor ?? "").trim().replace(/\s/g, "");
  if (!texto) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

/**
 * Terminal elegido para una ciudad: su nombre legible, `null` si no se indicó, o `undefined`
 * si no es del catálogo o no queda en esa ciudad ni en su estado.
 */
function leerTerminal(claveTerminal: string, ciudad: string, estado: string): string | null | undefined {
  if (!claveTerminal) return null;
  const terminal = terminalVE(claveTerminal);
  if (!terminal) return undefined;
  const opciones = terminalesParaSalir(ciudad, estado);
  const valido = [...opciones.ciudad, ...opciones.estado].some((t) => t.clave === terminal.clave);
  return valido ? terminal.nombre : undefined;
}

export async function guardarRuta(formData: FormData, rutaId?: string) {
  if (rutaId !== undefined && !UUID_RE.test(rutaId ?? "")) return { error: MSG_RUTA_NO_ENCONTRADA };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa" || !profile.cooperativa_id) {
    return { error: "Solo el administrador de la cooperativa puede crear o editar rutas." };
  }

  // Claves de lib/data/venezuela.ts ("carabobo", "valencia"): texto corto, sin espacios raros.
  const clave = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 80);
  const estado_origen = clave("estado_origen");
  const ciudad_origen = clave("ciudad_origen");
  const estado_destino = clave("estado_destino");
  const ciudad_destino = clave("ciudad_destino");
  const duracion_estimada_min = leerDuracion(formData);
  // Precio de referencia en USD: el pasajero paga en Bs a la tasa BCV del día.
  const precio_pasaje = Math.round(parsePrecio(formData.get("precio_pasaje")) * 100) / 100;
  const activa = formData.get("activa") === "on";

  if (!estado_origen || !ciudad_origen || !estado_destino || !ciudad_destino) {
    return { error: "Elige el estado y la ciudad de origen y de destino." };
  }
  if (isNaN(duracion_estimada_min) || duracion_estimada_min <= 0) {
    return {
      error: "Escribe cuánto dura el viaje: horas de 0 a 48 y minutos de 0 a 59 (por ejemplo, 8 h 30 min).",
      campo: "duracion" as const,
    };
  }
  if (isNaN(precio_pasaje) || precio_pasaje <= 0 || precio_pasaje > PRECIO_MAXIMO_USD) {
    return { error: "Escribe el precio del pasaje en dólares, por ejemplo 15 o 15,50." };
  }
  if (mismaCiudad(ciudad_origen, ciudad_destino)) {
    return { error: MSG_MISMA_CIUDAD, campo: "destino" as const };
  }

  // Terminales de salida y de llegada (opcionales): del catálogo, en la ciudad o en su estado.
  // Se guarda el nombre legible: es lo que ve el pasajero en la app al buscar el viaje.
  const terminal_origen = leerTerminal(clave("terminal"), ciudad_origen, estado_origen);
  if (terminal_origen === undefined) {
    return {
      error: `Ese terminal de salida no queda en ${formatCiudad(ciudad_origen)} ni en su estado. Elige otro o déjalo sin indicar.`,
      campo: "terminal" as const,
    };
  }
  const terminal_destino = leerTerminal(clave("terminal_destino"), ciudad_destino, estado_destino);
  if (terminal_destino === undefined) {
    return {
      error: `Ese terminal de llegada no queda en ${formatCiudad(ciudad_destino)} ni en su estado. Elige otro o déjalo sin indicar.`,
      campo: "terminal_destino" as const,
    };
  }

  const payload = {
    cooperativa_id: profile.cooperativa_id,
    estado_origen,
    ciudad_origen,
    estado_destino,
    ciudad_destino,
    terminal_origen,
    terminal_destino,
    duracion_estimada_min,
    precio_pasaje,
    activa,
  };

  if (rutaId) {
    const { data: filas, error } = await supabase
      .from("rutas")
      .update(payload)
      .eq("id", rutaId)
      .eq("cooperativa_id", profile.cooperativa_id)
      .select("id");
    if (error) return { error: humanizeError(error, "actualizar la ruta") };
    if (!filas || filas.length === 0) return { error: MSG_RUTA_NO_ENCONTRADA };
  } else {
    const { error } = await supabase.from("rutas").insert(payload);
    if (error) return { error: humanizeError(error, "crear la ruta") };
  }

  revalidatePath("/cooperativas/rutas");
  revalidatePath("/cooperativas/viajes");
  return { success: true };
}

export async function checkDesactivarRuta(rutaId: string) {
  if (!UUID_RE.test(rutaId ?? "")) return { error: MSG_RUTA_NO_ENCONTRADA };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile?.cooperativa_id) return { error: MSG_RUTA_NO_ENCONTRADA };

  const { count, error } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_id", profile.cooperativa_id)
    .eq("ruta_id", rutaId)
    .eq("estado", "PROGRAMADO")
    .gt("fecha_hora_salida", new Date().toISOString());

  if (error) return { error: humanizeError(error, "revisar los viajes de la ruta") };
  return { hasViajes: (count || 0) > 0, count: count || 0 };
}

export async function toggleActivaRuta(rutaId: string, activa: boolean) {
  if (!UUID_RE.test(rutaId ?? "")) return { error: MSG_RUTA_NO_ENCONTRADA };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") {
    return { error: "Solo el administrador de la cooperativa puede activar o desactivar rutas." };
  }

  const { data: filas, error } = await supabase
    .from("rutas")
    .update({ activa: activa === true })
    .eq("id", rutaId)
    .eq("cooperativa_id", profile.cooperativa_id)
    .select("id");
  if (error) return { error: humanizeError(error, "cambiar el estado de la ruta") };
  if (!filas || filas.length === 0) return { error: MSG_RUTA_NO_ENCONTRADA };

  revalidatePath("/cooperativas/rutas");
  revalidatePath("/cooperativas/viajes");
  return { success: true };
}
