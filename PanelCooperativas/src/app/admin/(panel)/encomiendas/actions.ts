"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";
import { humanizeError } from "@/lib/errores";

const MINIMO_MOTIVO = 5;

export type EncomiendaAdmin = {
  id: string;
  tracking_id: string;
  estado: string;
  cooperativa_id: string | null;
  cooperativa_nombre: string | null;
  ciudad_origen: string;
  estado_origen: string;
  ciudad_destino: string;
  estado_destino: string;
  descripcion_contenido: string;
  modalidad_pago: "ORIGEN" | "DESTINO";
  /** APP (el remitente es el usuario sender_id) o TAQUILLA (remitente en remitente_*). */
  origen_registro: "APP" | "TAQUILLA";
  remitente: { nombre: string | null; cedula: string | null; telefono: string | null; usuario_id: string | null };
  destinatario: { nombre: string; cedula: string; telefono: string; usuario_id: string | null };
  intentos_pin: number;
  pin_bloqueado: boolean;
  created_at: string;
  updated_at: string;
};

export type ResultadoBusqueda =
  | { estado: "encontrada"; encomienda: EncomiendaAdmin }
  | { estado: "no_encontrada"; codigo: string }
  | { estado: "error"; error: string };

/** "eb 241003 00042", "EB24100300042" → "EB-241003-00042"; otros formatos, en mayúsculas sin espacios. */
function normalizarCodigo(codigo: string): string {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const m = limpio.replace(/-/g, "").match(/^EB(\d{6})(\d{5})$/);
  return m ? `EB-${m[1]}-${m[2]}` : limpio;
}

type Fila = Record<string, unknown> & {
  cooperativa?: { nombre?: string | null } | { nombre?: string | null }[] | null;
  remitente_perfil?:
    | { nombre_completo?: string | null; telefono?: string | null; cedula_rif?: string | null }
    | { nombre_completo?: string | null; telefono?: string | null; cedula_rif?: string | null }[]
    | null;
};

function uno<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/** Busca una encomienda por su código de seguimiento (EB-AAMMDD-NNNNN). */
export async function buscarEncomiendaAdmin(codigo: string): Promise<ResultadoBusqueda> {
  try {
    await requireSuperAdmin();
    const tracking = normalizarCodigo(String(codigo ?? "").slice(0, 40));
    if (!tracking) return { estado: "no_encontrada", codigo: "" };

    const supabase = await createClient();
    // `*` tolera la base sin las columnas de la fase 3 (remitente_*, origen_registro).
    const { data, error } = await supabase
      .from("encomiendas")
      .select("*, cooperativa:cooperativas(nombre), remitente_perfil:profiles!sender_id(nombre_completo, telefono, cedula_rif)")
      .eq("tracking_id", tracking)
      .maybeSingle();

    if (error) {
      console.error("[buscarEncomiendaAdmin]", error);
      return { estado: "error", error: humanizeError(error, "buscar la encomienda") };
    }
    if (!data) return { estado: "no_encontrada", codigo: tracking };

    const e = data as Fila;
    const taquilla = e.origen_registro === "TAQUILLA";
    const perfil = uno(e.remitente_perfil);
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

    return {
      estado: "encontrada",
      encomienda: {
        id: String(e.id),
        tracking_id: String(e.tracking_id),
        estado: String(e.estado),
        cooperativa_id: texto(e.cooperativa_id),
        cooperativa_nombre: uno(e.cooperativa)?.nombre ?? null,
        ciudad_origen: String(e.ciudad_origen ?? ""),
        estado_origen: String(e.estado_origen ?? ""),
        ciudad_destino: String(e.ciudad_destino ?? ""),
        estado_destino: String(e.estado_destino ?? ""),
        descripcion_contenido: String(e.descripcion_contenido ?? ""),
        modalidad_pago: e.modalidad_pago === "DESTINO" ? "DESTINO" : "ORIGEN",
        origen_registro: taquilla ? "TAQUILLA" : "APP",
        // Alta en taquilla: sender_id es el empleado; el remitente real va en remitente_*.
        remitente: taquilla
          ? {
              nombre: texto(e.remitente_nombre),
              cedula: texto(e.remitente_cedula),
              telefono: texto(e.remitente_telefono),
              usuario_id: null,
            }
          : {
              nombre: texto(e.remitente_nombre) ?? perfil?.nombre_completo ?? null,
              cedula: texto(e.remitente_cedula) ?? perfil?.cedula_rif ?? null,
              telefono: texto(e.remitente_telefono) ?? perfil?.telefono ?? null,
              usuario_id: texto(e.sender_id),
            },
        destinatario: {
          nombre: String(e.receiver_nombre ?? ""),
          cedula: String(e.receiver_cedula_rif ?? ""),
          telefono: String(e.receiver_telefono ?? ""),
          usuario_id: texto(e.receiver_user_id),
        },
        intentos_pin: Number(e.intentos_pin ?? 0),
        pin_bloqueado: Boolean(e.pin_bloqueado),
        created_at: String(e.created_at),
        updated_at: String(e.updated_at),
      },
    };
  } catch (err) {
    console.error("[buscarEncomiendaAdmin]", err);
    return { estado: "error", error: humanizeError(err, "buscar la encomienda") };
  }
}

/**
 * Desbloquea el PIN de retiro con fn_desbloquear_pin: reinicia los intentos,
 * exige motivo y solo aplica a encomiendas que no están cerradas.
 */
export async function desbloquearPinEncomienda(encomiendaId: string, motivo: string) {
  try {
    await requireSuperAdmin();
    if (!esUuid(encomiendaId)) {
      return { success: false, error: "No encontramos la encomienda. Actualiza la página e intenta de nuevo." };
    }
    const motivoLimpio = String(motivo ?? "").trim().slice(0, 500);
    if (motivoLimpio.length < MINIMO_MOTIVO) {
      return { success: false, error: `Escribe por qué desbloqueas el PIN (mínimo ${MINIMO_MOTIVO} caracteres).` };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_desbloquear_pin", {
      p_encomienda_id: encomiendaId,
      p_motivo: motivoLimpio,
    });
    if (error) {
      console.error("[desbloquearPinEncomienda]", error);
      return { success: false, error: humanizeError(error, "desbloquear el PIN") };
    }

    revalidatePath("/admin/encomiendas");
    revalidatePath("/admin/usuarios", "layout");
    const intentosPrevios = (data as { intentos_previos?: number } | null)?.intentos_previos ?? null;
    return { success: true, intentosPrevios };
  } catch (err) {
    console.error("[desbloquearPinEncomienda]", err);
    return { success: false, error: humanizeError(err, "desbloquear el PIN") };
  }
}
