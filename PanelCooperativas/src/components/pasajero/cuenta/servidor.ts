import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  TIPOS_METODO_PASAJERO,
  validarDatosPago,
  type DatosPagoPasajero,
  type TipoMetodoPagoPasajero,
} from "@/lib/pasajero/pagos-comun";
import { esUuid } from "./formato";

/** Cliente de sesión y uid verificado (firma del JWT); `uid` null si no hay sesión. */
export async function sesionServidor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? null : data?.claims?.sub;
  const email = error ? null : data?.claims?.email;
  return {
    supabase,
    uid: typeof sub === "string" && sub ? sub : null,
    email: typeof email === "string" ? email : null,
  };
}

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/**
 * Valida y normaliza lo que declara el pasajero con las MISMAS reglas que el cliente
 * (`validarDatosPago`). El tipo de la cuenta (Pago Móvil, Transferencia, Zelle) se lee de la
 * base: de él dependen la referencia, el banco y el capture obligatorio. Devuelve el primer
 * error en texto, o los datos normalizados (referencia sin separadores, banco, capture).
 */
export async function normalizarPago(
  supabase: ClienteServidor,
  e: DatosPagoPasajero
): Promise<{ error: string } | { datos: DatosPagoPasajero }> {
  if (!e || typeof e !== "object") return { error: "No pudimos leer los datos del pago." };
  if (!esUuid(e.metodoPagoId)) return { error: "Elige una forma de pago." };
  const { data: metodo, error } = await supabase
    .from("metodos_pago_cooperativa")
    .select("id, tipo")
    .eq("id", e.metodoPagoId)
    .eq("activo", true)
    .maybeSingle<{ id: string; tipo: string }>();
  if (error) return { error: "No pudimos revisar tu pago. Intenta de nuevo." };
  if (!metodo || !TIPOS_METODO_PASAJERO.includes(metodo.tipo as TipoMetodoPagoPasajero)) {
    return { error: "Elige una forma de pago." };
  }
  const monto = typeof e.montoDeclarado === "number" ? e.montoDeclarado : Number(e.montoDeclarado);
  const r = validarDatosPago(
    {
      metodoPagoId: metodo.id,
      numeroReferencia: typeof e.numeroReferencia === "string" ? e.numeroReferencia : "",
      fechaTransaccion: typeof e.fechaTransaccion === "string" ? e.fechaTransaccion : "",
      bancoEmisor: typeof e.bancoEmisor === "string" ? e.bancoEmisor : "",
      montoDeclarado: Number.isFinite(monto) && monto <= 1e9 ? monto : null,
      comprobantePath: typeof e.comprobantePath === "string" ? e.comprobantePath : null,
    },
    { id: metodo.id, tipo: metodo.tipo as TipoMetodoPagoPasajero }
  );
  if (!r.ok) return { error: Object.values(r.errores)[0] ?? "Revisa los datos del pago." };
  if (r.datos.bancoEmisor.length > 80) return { error: "Revisa el banco del pago." };
  return { datos: r.datos };
}

/** Lo que llega del navegador al reportar un pago (se valida otra vez aquí; la base también valida). */
export interface EntradaPago extends DatosPagoPasajero {
  /** Tasa Bs/USD que vio el pasajero; null si no había. */
  tasaEsperada: number | null;
  idempotencyKey: string;
}

/**
 * Valida la entrada de pago de una reserva o envío y la devuelve normalizada (misma validación
 * que el cliente y que `reportarPago`), o el mensaje de error.
 */
export async function validarEntradaPago<T extends EntradaPago>(
  supabase: ClienteServidor,
  e: T,
  uid: string
): Promise<{ error: string } | { entrada: T }> {
  const n = await normalizarPago(supabase, e);
  if ("error" in n) return n;
  if (n.datos.comprobantePath) {
    const ruta = n.datos.comprobantePath;
    if (ruta.length > 200 || !ruta.startsWith(`${uid}/`)) {
      return { error: "No pudimos leer tu comprobante. Adjúntalo de nuevo." };
    }
  }
  if (e.tasaEsperada != null && (!Number.isFinite(e.tasaEsperada) || e.tasaEsperada <= 0)) {
    return { error: "Actualiza la página e intenta de nuevo." };
  }
  if (typeof e.idempotencyKey !== "string" || e.idempotencyKey.length < 8 || e.idempotencyKey.length > 100) {
    return { error: "Actualiza la página e intenta de nuevo." };
  }
  return { entrada: { ...e, ...n.datos } };
}
