"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { exito, falla, fallaDe, SESION_VENCIDA, type ResultadoAccion } from "@/components/pasajero/cuenta/resultado";
import { sesionServidor } from "@/components/pasajero/cuenta/servidor";
import { codigoEB, errorDeFuncion, humanizeError } from "@/lib/errores";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { obtenerPasajero } from "@/lib/pasajero/sesion";
import { cedulaParaGuardar, CEDULA_ERROR, CLAVE_ERROR, CLAVE_MINIMO, telefonoParaGuardar, TELEFONO_ERROR } from "@/lib/ve";

const CLAVES_NOTIFICACION = ["notif_boletos", "notif_encomiendas", "notif_recordatorios"] as const;
export type ClaveNotificacion = (typeof CLAVES_NOTIFICACION)[number];

const MOTIVOS_BAJA = ["Ya no la uso", "Tengo otra cuenta", "Problemas con la app", "Otro"] as const;

const SOLO_PASAJEROS = "Esta cuenta es del panel de cooperativas: sus datos se cambian desde el panel.";

/** Mensaje de error si quien llama no es un pasajero con sesión; null si puede continuar. */
async function errorSiNoEsPasajero(): Promise<string | null> {
  const pasajero = await obtenerPasajero();
  if (!pasajero) return SESION_VENCIDA;
  return pasajero.esPasajero ? null : SOLO_PASAJEROS;
}

function refrescar() {
  revalidatePath(RUTAS_PASAJERO.cuenta, "layout");
}

/** true si la cuenta tiene contraseña (proveedor correo); false si solo entra con Google. */
function conContrasena(user: User): boolean {
  const meta = user.app_metadata ?? {};
  const proveedores = [
    ...(Array.isArray(meta.providers) ? (meta.providers as unknown[]) : []),
    ...(typeof meta.provider === "string" ? [meta.provider] : []),
    ...(user.identities ?? []).map((i) => i.provider),
  ].filter((p): p is string => typeof p === "string");
  return proveedores.length === 0 || proveedores.includes("email");
}

// ─── Datos personales ────────────────────────────────────────────────────────

export interface DatosPersonales {
  nombre: string;
  cedula: string;
  telefono: string;
}

export type ResultadoDatos =
  | { success: true; data: DatosPersonales }
  | { success: false; error: string; codigo?: string; campos?: Partial<Record<keyof DatosPersonales, string>> };

export async function guardarDatosPersonales(entrada: DatosPersonales): Promise<ResultadoDatos> {
  const nombre = typeof entrada?.nombre === "string" ? entrada.nombre.trim().replace(/\s+/g, " ") : "";
  const cedula = cedulaParaGuardar(entrada?.cedula);
  const telefono = telefonoParaGuardar(entrada?.telefono);

  const campos: Partial<Record<keyof DatosPersonales, string>> = {};
  if (nombre.length < 3 || nombre.length > 100 || !/\p{L}/u.test(nombre)) {
    campos.nombre = "Escribe tu nombre completo (mínimo 3 letras).";
  }
  if (!cedula) campos.cedula = CEDULA_ERROR;
  if (!telefono) campos.telefono = TELEFONO_ERROR;
  if (!cedula || !telefono || campos.nombre) return { success: false, error: "Revisa los datos marcados.", campos };

  const noPasajero = await errorSiNoEsPasajero();
  if (noPasajero) return falla(noPasajero);
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ nombre_completo: nombre, cedula_rif: cedula, telefono })
      .eq("id", uid)
      .select("id");
    if (error) return fallaDe(error, "guardar tus datos");
    if (!data?.length) return falla("No pudimos guardar tus datos. Intenta de nuevo.");
    refrescar();
    return exito({ nombre, cedula, telefono });
  } catch (err) {
    return fallaDe(err, "guardar tus datos");
  }
}

// ─── Notificaciones ──────────────────────────────────────────────────────────

export async function guardarNotificacion(entrada: { clave: ClaveNotificacion; valor: boolean }): Promise<ResultadoAccion<boolean>> {
  if (!entrada || !CLAVES_NOTIFICACION.includes(entrada.clave) || typeof entrada.valor !== "boolean") {
    return falla("No pudimos guardar tu preferencia.");
  }
  const noPasajero = await errorSiNoEsPasajero();
  if (noPasajero) return falla(noPasajero);
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ [entrada.clave]: entrada.valor })
      .eq("id", uid)
      .select("id");
    if (error) return fallaDe(error, "guardar tu preferencia");
    if (!data?.length) return falla("No pudimos guardar tu preferencia.");
    return exito(entrada.valor);
  } catch (err) {
    return fallaDe(err, "guardar tu preferencia");
  }
}

// ─── Contraseña ──────────────────────────────────────────────────────────────

export async function cambiarClave(entrada: { actual: string; nueva: string }): Promise<ResultadoAccion<{ creada: boolean }>> {
  const nueva = typeof entrada?.nueva === "string" ? entrada.nueva : "";
  const actual = typeof entrada?.actual === "string" ? entrada.actual : "";
  if (nueva.length < CLAVE_MINIMO) return falla(CLAVE_ERROR, "NUEVA");
  if (nueva.length > 72) return falla("Usa como máximo 72 caracteres.", "NUEVA");

  const noPasajero = await errorSiNoEsPasajero();
  if (noPasajero) return falla(noPasajero);
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);

  try {
    const { data: usuario, error: errUsuario } = await supabase.auth.getUser();
    const user = usuario?.user;
    if (errUsuario || !user) return falla(SESION_VENCIDA);
    const tenia = conContrasena(user);

    if (tenia) {
      if (!actual) return falla("Escribe tu contraseña actual.", "ACTUAL");
      if (!user.email) return falla(SESION_VENCIDA);
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: actual });
      if (error) {
        const credencial = error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message);
        if (credencial) return falla("La contraseña actual no es correcta.", "ACTUAL");
        return fallaDe(error, "cambiar tu contraseña");
      }
    }

    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) {
      if (error.code === "same_password" || error.code === "weak_password") {
        return falla(humanizeError(error, "cambiar tu contraseña"), "NUEVA");
      }
      if (error.code === "reauthentication_needed") {
        return falla("Por seguridad, cierra sesión y vuelve a entrar con Google; después crea tu contraseña.");
      }
      return fallaDe(error, "cambiar tu contraseña");
    }
    return exito({ creada: !tenia });
  } catch (err) {
    return fallaDe(err, "cambiar tu contraseña");
  }
}

// ─── Cerrar sesión ───────────────────────────────────────────────────────────

export async function cerrarSesionPasajero(): Promise<void> {
  const { supabase } = await sesionServidor();
  try {
    await supabase.auth.signOut();
  } catch {
    // Sin conexión con Auth la cookie se limpia igual en el siguiente paso.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  redirect(RUTAS_PASAJERO.inicio);
}

// ─── Eliminar cuenta ─────────────────────────────────────────────────────────

/**
 * Misma secuencia que la app: `fn_eliminar_mi_cuenta` anonimiza el perfil (o falla con
 * `EB_CUENTA_CON_ACTIVIDAD` si hay algo por terminar), la función `eliminar-cuenta` borra la
 * identidad de Auth y se cierra la sesión.
 */
export async function eliminarMiCuenta(entrada: { motivo: string | null }): Promise<ResultadoAccion<{ aviso: string | null }>> {
  const motivo = (MOTIVOS_BAJA as readonly string[]).includes(entrada?.motivo ?? "") ? entrada.motivo : null;
  const noPasajero = await errorSiNoEsPasajero();
  if (noPasajero) return falla(noPasajero);
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);

  try {
    const { data, error } = await supabase.rpc("fn_eliminar_mi_cuenta", { p_motivo: motivo });
    if (error) return fallaDe(error, "eliminar tu cuenta");
    if (!(data as { eliminada_at?: string } | null)?.eliminada_at) return falla("No pudimos eliminar tu cuenta. Intenta de nuevo.");
  } catch (err) {
    return fallaDe(err, "eliminar tu cuenta");
  }

  // La baja ya quedó hecha: lo que sigue no puede deshacerla.
  let aviso: string | null = null;
  try {
    const { error } = await supabase.functions.invoke("eliminar-cuenta", { method: "POST" });
    if (error) {
      const detalle = await errorDeFuncion(error);
      if (codigoEB(detalle) === "EB_BAJA_PENDIENTE") aviso = humanizeError(detalle);
    }
  } catch {
    // Si la función falla, el administrador completa la baja.
  }
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // La sesión de un perfil eliminado deja de servir de todos modos.
  }
  refrescar();
  return exito({ aviso });
}
