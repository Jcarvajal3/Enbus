"use server";

// ─── Registro y onboarding de cooperativa ───────────────────────────────────
// Flujo en dos etapas:
//   1. crearCuentaCooperativa: crea la cuenta de administrador sin cooperativa y
//      abre sesión en cookies para avanzar al onboarding.
//   2. completarOnboardingCooperativa: valida los datos de la cooperativa, crea
//      el registro en estado PENDIENTE y vincula el perfil del administrador.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { INICIO } from "@/lib/navigation";
import { normalizeRif, RIF_ERROR } from "@/lib/rif";
import { humanizeError, textoDemasiadosIntentos } from "@/lib/errores";
import { CLAVE_ERROR, CLAVE_MINIMO, telefonoParaGuardar, TELEFONO_ERROR } from "@/lib/ve";
import { consumirLimitePorIp, LIMITE_REGISTRO, LIMITE_VERIFICAR_CORREO } from "./limite";
import { avisarAdminSolicitud, sendSolicitudRecibidaEmail } from "@/lib/email";

export type CampoRegistro =
  | "email"
  | "password"
  | "confirmPassword"
  | "nombre"
  | "rif"
  | "telefono"
  | "representante"
  | "mensaje";

export interface ActionState {
  error?: string | null;
  success?: boolean;
  etapa?: "cuenta" | "onboarding";
  email?: string;
  campo?: CampoRegistro;
  errores?: Partial<Record<CampoRegistro, string>>;
  codigo?: "EB_DEMASIADOS_INTENTOS";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_EMAIL_USADO = "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";
const MSG_RIF_USADO = "Ya existe una cooperativa registrada con este RIF. Si es la tuya, inicia sesión.";

async function deshacerCooperativa(supabaseAdmin: ReturnType<typeof createAdminClient>, cooperativaId: string) {
  const { error } = await supabaseAdmin.from("cooperativas").delete().eq("id", cooperativaId);
  if (error) {
    console.error("[completarOnboardingCooperativa] Error al deshacer la cooperativa:", error);
  }
}

export async function crearCuentaCooperativa(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const texto = (k: string) => String(formData.get(k) ?? "");
  const email = texto("email").trim().toLowerCase();
  const password = texto("password");
  const confirmPassword = texto("confirmPassword");

  const errores: Partial<Record<CampoRegistro, string>> = {};
  if (!EMAIL_RE.test(email)) errores.email = "Escribe un correo válido, por ejemplo tu@correo.com.";
  if (password.length < CLAVE_MINIMO) errores.password = CLAVE_ERROR;
  else if (password !== confirmPassword) errores.confirmPassword = "Las contraseñas no coinciden.";

  const orden: CampoRegistro[] = ["email", "password", "confirmPassword"];
  const primero = orden.find((c) => errores[c]);
  if (primero) {
    return { error: "Revisa los campos marcados.", campo: primero, errores };
  }

  const limite = await consumirLimitePorIp(LIMITE_VERIFICAR_CORREO);
  if (!limite.permitido) {
    return {
      error: textoDemasiadosIntentos(limite.reintentarEnSegundos),
      codigo: "EB_DEMASIADOS_INTENTOS",
    };
  }

  const supabaseAdmin = createAdminClient();

  try {
    const { data: emailExiste, error: emailError } = await supabaseAdmin.rpc("fn_email_registrado", {
      p_email: email,
    });
    if (emailError) {
      // Si la RPC no está disponible, createUser vuelve a comprobar el correo (email_exists).
      console.error("[crearCuentaCooperativa] Error al verificar el correo:", emailError);
    } else if (emailExiste === true) {
      return { error: MSG_EMAIL_USADO, campo: "email", errores: { email: MSG_EMAIL_USADO } };
    }

    // telefono y cedula_rif son UNIQUE en profiles: se usan marcadores únicos hasta completar datos.
    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        telefono: `PENDIENTE-${crypto.randomUUID()}`,
        cedula_rif: `PENDIENTE-${crypto.randomUUID()}`,
      },
    });

    if (createUserError || !authData.user) {
      console.error("[crearCuentaCooperativa] Error al crear la cuenta:", createUserError);
      const code = createUserError?.code;
      const esEmail = code === "email_exists" || code === "user_already_exists" || code === "email_address_invalid";
      const campo: CampoRegistro | undefined = esEmail ? "email" : code === "weak_password" ? "password" : undefined;
      const msg =
        code === "email_exists" || code === "user_already_exists"
          ? MSG_EMAIL_USADO
          : humanizeError(createUserError, "crear la cuenta");
      return { error: msg, campo, errores: campo ? { [campo]: msg } : undefined };
    }

    const userId = authData.user.id;

    const { data: perfiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        role: "admin_cooperativa",
        cooperativa_id: null,
      })
      .eq("id", userId)
      .select("id");

    if (profileError || !perfiles || perfiles.length === 0) {
      if (profileError) console.error("[crearCuentaCooperativa] Error al actualizar el perfil:", profileError);
      // Respaldo si el trigger handle_new_user aún no creó la fila.
      const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        role: "admin_cooperativa",
        cooperativa_id: null,
        nombre_completo: email.split("@")[0] || "Administrador",
        telefono: `PENDIENTE-${userId}`,
        cedula_rif: `PENDIENTE-${userId}`,
      });
      if (upsertError) {
        console.error("[crearCuentaCooperativa] Error al crear el perfil:", upsertError);
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) console.error("[crearCuentaCooperativa] Error al deshacer el usuario:", deleteError);
        return { error: humanizeError(upsertError, "configurar tu cuenta") };
      }
    }

    const supabaseSession = await createClient();
    const { error: loginError } = await supabaseSession.auth.signInWithPassword({ email, password });
    if (loginError) {
      console.error("[crearCuentaCooperativa] Error al iniciar sesión:", loginError);
      return {
        success: true,
        error: "Tu cuenta quedó creada, pero no pudimos iniciar tu sesión automáticamente. Inicia sesión para continuar.",
      };
    }

    return { success: true, etapa: "onboarding", email };
  } catch (error) {
    console.error("[crearCuentaCooperativa] Excepción:", error);
    return { error: humanizeError(error, "crear la cuenta") };
  }
}

export async function completarOnboardingCooperativa(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabaseSession = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseSession.auth.getUser();

  if (authError || !authUser) {
    return { error: "Tu sesión expiró. Inicia sesión para continuar.", etapa: "cuenta" };
  }

  const supabaseAdmin = createAdminClient();
  let profile: { role: string | null; cooperativa_id: string | null; eliminada_at: string | null } | null = null;

  try {
    const { data, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, cooperativa_id, eliminada_at")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("[completarOnboardingCooperativa] Error al leer el perfil:", profileError);
      return { error: humanizeError(profileError, "verificar tu cuenta") };
    }
    profile = data;
  } catch (error) {
    console.error("[completarOnboardingCooperativa] Excepción al verificar el perfil:", error);
    return { error: humanizeError(error, "verificar tu cuenta") };
  }

  if (profile?.eliminada_at || (profile && profile.role !== "admin_cooperativa" && profile.role !== "user")) {
    return { error: "Esta cuenta no puede registrar una cooperativa." };
  }
  if (profile?.cooperativa_id) {
    redirect(INICIO);
  }

  const texto = (k: string) => String(formData.get(k) ?? "");
  const nombre = texto("nombre").trim().replace(/\s+/g, " ");
  const rifInput = texto("rif");
  const telefonoInput = texto("telefono");
  const representante = texto("representante").trim().replace(/\s+/g, " ");
  const mensaje = texto("mensaje").trim().slice(0, 1000);

  const errores: Partial<Record<CampoRegistro, string>> = {};
  if (nombre.length < 3) errores.nombre = "Escribe el nombre de tu cooperativa (mínimo 3 caracteres).";
  const rif = normalizeRif(rifInput);
  if (!rif) errores.rif = RIF_ERROR;
  const telefono = telefonoParaGuardar(telefonoInput);
  if (!telefono) errores.telefono = TELEFONO_ERROR;
  if (representante.length < 3) errores.representante = "Escribe el nombre y apellido del representante legal.";

  const orden: CampoRegistro[] = ["nombre", "rif", "telefono", "representante"];
  const primero = orden.find((c) => errores[c]);
  if (primero || !rif || !telefono) {
    return { error: "Revisa los campos marcados.", etapa: "onboarding", campo: primero, errores };
  }

  const limite = await consumirLimitePorIp(LIMITE_REGISTRO);
  if (!limite.permitido) {
    return {
      error: textoDemasiadosIntentos(limite.reintentarEnSegundos),
      etapa: "onboarding",
      codigo: "EB_DEMASIADOS_INTENTOS",
    };
  }

  let cooperativaId: string | null = null;

  try {
    const { data: existingCoop, error: checkError } = await supabaseAdmin
      .from("cooperativas")
      .select("id")
      .eq("rif", rif)
      .maybeSingle();

    if (checkError) {
      console.error("[completarOnboardingCooperativa] Error al verificar el RIF:", checkError);
      return { error: humanizeError(checkError, "verificar el registro"), etapa: "onboarding" };
    }
    if (existingCoop) {
      return { error: MSG_RIF_USADO, etapa: "onboarding", campo: "rif", errores: { rif: MSG_RIF_USADO } };
    }

    const base = {
      nombre,
      rif,
      estado: "PENDIENTE",
      comision_porcentaje: 0.0,
      telefono,
      email: (authUser.email ?? "").trim().toLowerCase() || null,
    };

    let insert = await supabaseAdmin
      .from("cooperativas")
      .insert({ ...base, representante, mensaje_registro: mensaje || null })
      .select("id")
      .single();

    if (insert.error?.code === "42703" || insert.error?.code === "PGRST204") {
      // Respaldo si la migración 20260720000002 aún no se aplicó.
      insert = await supabaseAdmin
        .from("cooperativas")
        .insert({
          ...base,
          descripcion: mensaje ? `Representante: ${representante}. Mensaje: ${mensaje}` : `Representante: ${representante}`,
        })
        .select("id")
        .single();
    }

    if (insert.error || !insert.data) {
      console.error("[completarOnboardingCooperativa] Error al crear la cooperativa:", insert.error);
      const esRif = insert.error?.code === "23505";
      const msg = esRif ? MSG_RIF_USADO : humanizeError(insert.error, "registrar la cooperativa");
      return {
        error: msg,
        etapa: "onboarding",
        campo: esRif ? "rif" : undefined,
        errores: esRif ? { rif: msg } : undefined,
      };
    }

    cooperativaId = insert.data.id as string;

    const { data: perfiles, error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        role: "admin_cooperativa",
        cooperativa_id: cooperativaId,
        nombre_completo: representante,
      })
      .eq("id", authUser.id)
      .select("id");

    if (profileUpdateError) {
      console.error("[completarOnboardingCooperativa] Error al actualizar el perfil:", profileUpdateError);
      await deshacerCooperativa(supabaseAdmin, cooperativaId);
      return { error: humanizeError(profileUpdateError, "configurar tu cuenta"), etapa: "onboarding" };
    }

    if (!perfiles || perfiles.length === 0) {
      const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        role: "admin_cooperativa",
        cooperativa_id: cooperativaId,
        nombre_completo: representante,
        telefono: `PENDIENTE-${crypto.randomUUID()}`,
        cedula_rif: `PENDIENTE-${crypto.randomUUID()}`,
      });
      if (upsertError) {
        console.error("[completarOnboardingCooperativa] Error al crear el perfil:", upsertError);
        await deshacerCooperativa(supabaseAdmin, cooperativaId);
        return { error: humanizeError(upsertError, "configurar tu cuenta"), etapa: "onboarding" };
      }
    }
  } catch (error) {
    console.error("[completarOnboardingCooperativa] Excepción:", error);
    if (cooperativaId) {
      await deshacerCooperativa(supabaseAdmin, cooperativaId);
    }
    return { error: humanizeError(error, "procesar el registro"), etapa: "onboarding" };
  }

  // Correos (no bloquean el registro si fallan): confirmación a la cooperativa y aviso al equipo.
  const correoCooperativa = (authUser.email ?? "").trim().toLowerCase();
  await Promise.allSettled([
    correoCooperativa
      ? sendSolicitudRecibidaEmail({ email: correoCooperativa, cooperativaNombre: nombre })
      : Promise.resolve(),
    avisarAdminSolicitud({ cooperativaNombre: nombre, rif, representante }),
  ]);

  // redirect() lanza una excepción interna: va fuera del try (docs de Next.js 16).
  redirect(INICIO);
}
