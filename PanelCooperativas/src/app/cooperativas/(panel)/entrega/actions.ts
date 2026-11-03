"use server";

// ─── Entrega en destino ─────────────────────────────────────────────────────
// Todo se decide en el servidor (fase 3):
// - fn_validar_pin_retiro cuenta los intentos fallidos (no lanza error) y
//   bloquea el PIN a los 10.
// - fn_entregar_encomienda vuelve a revisar el PIN, exige la cédula verificada
//   y el cobro si paga quien recibe (EB_COBRO_PENDIENTE). Sin PIN, solo el
//   administrador de la cooperativa y con motivo (≥ 10 caracteres).
// - fn_desbloquear_pin: administrador de la cooperativa o equipo de EnBus.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError, parseDetalleEB, type DetalleEB } from "@/lib/errores";
import { cedulaParaGuardar } from "@/lib/ve";
import type { ResultadoDesbloqueoPin, ResultadoEntrega, ValidacionPinRetiro } from "@/lib/types/encomiendas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_NO_ENCONTRADA = "No encontramos esta encomienda. Actualiza la lista e intenta de nuevo.";

export type ResultadoEntregaAccion<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined; detalle?: undefined }
  | { success: false; data?: undefined; error: string; codigo?: string; detalle?: DetalleEB };

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string; detalle?: DetalleEB } {
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo: codigoEB(error) ?? undefined,
    detalle: parseDetalleEB(error),
  };
}

function revalidarEntrega() {
  revalidatePath("/cooperativas/entrega");
  revalidatePath("/cooperativas/taquilla/encomiendas");
}

/** Resultado de validar el PIN, con el texto para el taquillero. */
export type ValidacionPin = ValidacionPinRetiro & { mensaje?: string };

/** Valida el PIN de retiro en el servidor (cada intento fallido cuenta; 10 → bloqueado). */
export async function validarPin(
  encomiendaId: string,
  pinIngresado: string
): Promise<ResultadoEntregaAccion<ValidacionPin>> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  const pin = (pinIngresado ?? "").replace(/\D/g, "");
  if (pin.length !== 4) {
    return { success: false, error: "El PIN tiene 4 dígitos. Escríbelo completo.", detalle: { campo: "pin" } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_validar_pin_retiro", {
    p_encomienda_id: encomiendaId,
    p_pin: pin,
  });
  if (error) {
    console.error("Error al validar el PIN de retiro:", error);
    return fallo(error, "verificar el PIN");
  }

  const v = data as ValidacionPinRetiro;
  const restantes = Math.max(0, Number(v?.intentos_restantes ?? 0));
  let mensaje: string | undefined;
  if (v?.bloqueado) {
    mensaje = "El PIN se bloqueó por intentos fallidos.";
  } else if (!v?.valido) {
    mensaje =
      restantes === 1
        ? "PIN incorrecto. Te queda 1 intento."
        : `PIN incorrecto. Te quedan ${restantes} intentos.`;
  }
  if (v?.bloqueado || !v?.valido) revalidarEntrega();
  return {
    success: true,
    data: { valido: Boolean(v?.valido), bloqueado: Boolean(v?.bloqueado), intentos_restantes: restantes, mensaje },
  };
}

export type ConfirmarEntregaInput = {
  encomiendaId: string;
  /** PIN validado en el paso anterior (el servidor lo vuelve a revisar). Vacío si se entrega sin PIN. */
  pin: string | null;
  /** "Revisé la cédula y coincide". */
  cedulaVerificada: boolean;
  retiraTercero?: boolean;
  retiroNombre?: string | null;
  retiroCedula?: string | null;
  /** Solo el administrador de la cooperativa, con el PIN bloqueado u olvidado (≥ 10 caracteres). */
  sinPinMotivo?: string | null;
};

/**
 * Entrega la encomienda (EN_OFICINA_DESTINO → ENTREGADA) con PIN y cédula
 * verificada. El servidor impide entregar sin cobro (EB_COBRO_PENDIENTE), con
 * el PIN incorrecto (EB_PIN_INCORRECTO) o bloqueado (EB_PIN_BLOQUEADO).
 */
export async function confirmarEntrega(input: ConfirmarEntregaInput): Promise<ResultadoEntregaAccion<ResultadoEntrega>> {
  if (!UUID_RE.test(input?.encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  if (!input.cedulaVerificada) {
    return {
      success: false,
      error: "Confirma que revisaste la cédula de quien retira.",
      codigo: "EB_CEDULA_NO_VERIFICADA",
      detalle: { campo: "cedula" },
    };
  }
  const tercero = Boolean(input.retiraTercero);
  const sinPin = (input.sinPinMotivo ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_entregar_encomienda", {
    p_encomienda_id: input.encomiendaId,
    p_pin: sinPin ? null : (input.pin ?? "").replace(/\D/g, ""),
    p_cedula_verificada: true,
    p_retira_tercero: tercero,
    p_retiro_nombre: tercero ? (input.retiroNombre ?? "").trim().replace(/\s+/g, " ") : null,
    p_retiro_cedula: tercero ? cedulaParaGuardar(input.retiroCedula) ?? (input.retiroCedula ?? "").trim() : null,
    p_sin_pin_motivo: sinPin || null,
  });
  if (error) {
    console.error("Error al entregar la encomienda:", error);
    return fallo(error, "entregar la encomienda");
  }

  revalidarEntrega();
  return { success: true, data: data as ResultadoEntrega };
}

/** Desbloquea el PIN (solo el administrador de la cooperativa) dejando el motivo. */
export async function desbloquearPin(
  encomiendaId: string,
  motivo: string
): Promise<ResultadoEntregaAccion<ResultadoDesbloqueoPin>> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  const texto = (motivo ?? "").trim();
  if (texto.length < 5) {
    return { success: false, error: "Escribe por qué desbloqueas el PIN (mínimo 5 caracteres).", detalle: { campo: "motivo" } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_desbloquear_pin", {
    p_encomienda_id: encomiendaId,
    p_motivo: texto,
  });
  if (error) {
    console.error("Error al desbloquear el PIN:", error);
    return fallo(error, "desbloquear el PIN");
  }
  revalidarEntrega();
  return { success: true, data: data as ResultadoDesbloqueoPin };
}
