"use server";

// ─── Registro de cooperativa (canónico, #39) ────────────────────────────────
// Crea la cooperativa en estado PENDIENTE y la cuenta de su administrador, y
// entra al panel de inmediato: puede configurarlo mientras EnBus revisa la
// solicitud (24 a 48 horas hábiles).

import { createAdminClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeRif, RIF_ERROR } from "@/lib/rif";
import { humanizeError, textoDemasiadosIntentos } from "@/lib/errores";
import { telefonoParaGuardar, TELEFONO_ERROR } from "@/lib/ve";
import { consumirLimitePorIp, LIMITE_REGISTRO, LIMITE_VERIFICAR_CORREO } from "./limite";

export type CampoRegistro =
  | "nombre"
  | "email"
  | "password"
  | "confirmPassword"
  | "rif"
  | "telefono"
  | "representante"
  | "mensaje";

export interface ActionState {
  error?: string | null;
  success?: boolean;
  /** Primer campo con error, para volver al paso donde está y llevar el foco. */
  campo?: CampoRegistro;
  /** Errores por campo. */
  errores?: Partial<Record<CampoRegistro, string>>;
  /** EB_DEMASIADOS_INTENTOS: se alcanzó el límite de registros por hora desde esta conexión. */
  codigo?: "EB_DEMASIADOS_INTENTOS";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_EMAIL_USADO = "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";

/** Errores del paso 1 (cuenta). Mismas reglas en el cliente y aquí. */
function validarCuenta(d: { nombre: string; email: string; password: string; confirmPassword: string }) {
  const errores: Partial<Record<CampoRegistro, string>> = {};
  if (d.nombre.trim().length < 3) errores.nombre = "Escribe el nombre de tu cooperativa (mínimo 3 caracteres).";
  if (!EMAIL_RE.test(d.email.trim())) errores.email = "Escribe un correo válido, por ejemplo contacto@tucooperativa.com.";
  if (d.password.length < 8) errores.password = "La contraseña debe tener al menos 8 caracteres.";
  else if (d.password !== d.confirmPassword) errores.confirmPassword = "Las contraseñas no coinciden.";
  return errores;
}

export type ResultadoVerificarCorreo =
  | { registrado: boolean | null; codigo?: undefined; error?: undefined }
  /** Demasiadas consultas desde esta conexión (10 cada 10 minutos). */
  | { registrado: null; codigo: "EB_DEMASIADOS_INTENTOS"; error: string };

/**
 * ¿Ya hay una cuenta con este correo? Se consulta al salir del paso 1 para no
 * pedir los datos de la cooperativa en vano. `null` = no se pudo verificar (el
 * registro lo vuelve a comprobar al crear la cuenta). Como revela si un correo
 * tiene cuenta, se limita a 10 consultas cada 10 minutos por IP.
 */
export async function verificarCorreoRegistro(email: string): Promise<ResultadoVerificarCorreo> {
  const limpio = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(limpio)) return { registrado: null };
  const limite = await consumirLimitePorIp(LIMITE_VERIFICAR_CORREO);
  if (!limite.permitido) {
    return {
      registrado: null,
      codigo: "EB_DEMASIADOS_INTENTOS",
      error: textoDemasiadosIntentos(limite.reintentarEnSegundos),
    };
  }
  const { data, error } = await createAdminClient().rpc("fn_email_registrado", { p_email: limpio });
  if (error) {
    console.error("[verificarCorreoRegistro] Error:", error);
    return { registrado: null };
  }
  return { registrado: data === true };
}

export async function registrarCooperativa(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const texto = (k: string) => String(formData.get(k) ?? "");
  const nombre = texto("nombre").trim().replace(/\s+/g, " ");
  const email = texto("email").trim().toLowerCase();
  const password = texto("password");
  const confirmPassword = texto("confirmPassword");
  const rifInput = texto("rif");
  const telefonoInput = texto("telefono");
  const representante = texto("representante").trim().replace(/\s+/g, " ");
  const mensaje = texto("mensaje").trim().slice(0, 1000);

  // ── Validación por campo ──
  const errores = validarCuenta({ nombre, email, password, confirmPassword });
  // Acepta el RIF con o sin guiones y lo guarda normalizado ("J-12345678-9")
  const rif = normalizeRif(rifInput);
  if (!rif) errores.rif = RIF_ERROR;
  const telefono = telefonoParaGuardar(telefonoInput);
  if (!telefono) errores.telefono = TELEFONO_ERROR;
  if (representante.length < 3) errores.representante = "Escribe el nombre y apellido del representante legal.";

  const orden: CampoRegistro[] = ["nombre", "email", "password", "confirmPassword", "rif", "telefono", "representante"];
  const primero = orden.find((c) => errores[c]);
  if (primero) {
    return { error: "Revisa los campos marcados.", campo: primero, errores };
  }

  // Límite de frecuencia (5 registros por hora por IP): solo cuenta los intentos con datos válidos.
  const limite = await consumirLimitePorIp(LIMITE_REGISTRO);
  if (!limite.permitido) {
    return { error: textoDemasiadosIntentos(limite.reintentarEnSegundos), codigo: "EB_DEMASIADOS_INTENTOS" };
  }

  const supabase = createAdminClient();
  let cooperativaId: string | null = null;

  try {
    // 1. ¿Ya existe una cooperativa con este RIF?
    const { data: existingCoop, error: checkError } = await supabase
      .from("cooperativas")
      .select("id")
      .eq("rif", rif)
      .maybeSingle();
    if (checkError) {
      console.error("[registrarCooperativa] Error al verificar el RIF:", checkError);
      return { error: humanizeError(checkError, "verificar el registro") };
    }
    if (existingCoop) {
      const msg = "Ya existe una cooperativa registrada con este RIF. Si es la tuya, inicia sesión.";
      return { error: msg, campo: "rif", errores: { rif: msg } };
    }

    // 2. ¿El correo ya tiene cuenta? (sin listar usuarios: RPC solo para service_role)
    const { data: emailExiste, error: emailError } = await supabase.rpc("fn_email_registrado", { p_email: email });
    if (emailError) {
      // Si la RPC no está disponible, createUser lo vuelve a comprobar (email_exists).
      console.error("[registrarCooperativa] Error al verificar el correo:", emailError);
    } else if (emailExiste === true) {
      return { error: MSG_EMAIL_USADO, campo: "email", errores: { email: MSG_EMAIL_USADO } };
    }

    // 3. Cooperativa en estado PENDIENTE (representante y mensaje en sus columnas de la fase 3)
    const base = {
      nombre,
      rif,
      estado: "PENDIENTE",
      comision_porcentaje: 0.0,
      telefono,
      email,
    };
    let insert = await supabase
      .from("cooperativas")
      .insert({ ...base, representante, mensaje_registro: mensaje || null })
      .select("id")
      .single();
    if (insert.error?.code === "42703" || insert.error?.code === "PGRST204") {
      // La migración 20260720000002 aún no se aplicó: se guarda como antes, en la descripción.
      insert = await supabase
        .from("cooperativas")
        .insert({
          ...base,
          descripcion: mensaje ? `Representante: ${representante}. Mensaje: ${mensaje}` : `Representante: ${representante}`,
        })
        .select("id")
        .single();
    }
    if (insert.error || !insert.data) {
      console.error("[registrarCooperativa] Error al crear la cooperativa:", insert.error);
      const esRif = insert.error?.code === "23505";
      const msg = esRif
        ? "Ya existe una cooperativa registrada con este RIF. Si es la tuya, inicia sesión."
        : humanizeError(insert.error, "registrar la cooperativa");
      return { error: msg, campo: esRif ? "rif" : undefined, errores: esRif ? { rif: msg } : undefined };
    }
    cooperativaId = insert.data.id as string;

    // 4. Cuenta del administrador (correo confirmado: entra de inmediato)
    const { data: authData, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre_completo: representante,
        telefono,
        cedula_rif: rif,
      },
    });

    if (createUserError || !authData.user) {
      console.error("[registrarCooperativa] Error al crear la cuenta:", createUserError);
      // Se deshace la cooperativa para que pueda reintentar con el mismo RIF
      const { error: rollbackError } = await supabase.from("cooperativas").delete().eq("id", cooperativaId);
      if (rollbackError) console.error("[registrarCooperativa] Error al deshacer la cooperativa:", rollbackError);
      const code = createUserError?.code;
      const esEmail = code === "email_exists" || code === "user_already_exists" || code === "email_address_invalid";
      const msg = humanizeError(createUserError, "crear la cuenta");
      const campo: CampoRegistro | undefined = esEmail ? "email" : code === "weak_password" ? "password" : undefined;
      return { error: msg, campo, errores: campo ? { [campo]: msg } : undefined };
    }

    const userId = authData.user.id;

    // 5. Perfil: administrador de la cooperativa (el trigger handle_new_user crea la fila)
    const { data: perfiles, error: profileError } = await supabase
      .from("profiles")
      .update({
        role: "admin_cooperativa",
        cooperativa_id: cooperativaId,
        nombre_completo: representante,
      })
      .eq("id", userId)
      .select("id");

    if (profileError || !perfiles || perfiles.length === 0) {
      if (profileError) console.error("[registrarCooperativa] Error al actualizar el perfil:", profileError);
      // Si el trigger aún no creó la fila, se crea aquí.
      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: userId,
        role: "admin_cooperativa",
        cooperativa_id: cooperativaId,
        nombre_completo: representante,
        telefono,
        cedula_rif: rif,
      });
      if (upsertError) {
        console.error("[registrarCooperativa] Error al crear el perfil:", upsertError);
        // Sin perfil la cuenta no puede entrar al panel: se deshace todo para reintentar.
        await supabase.auth.admin.deleteUser(userId);
        await supabase.from("cooperativas").delete().eq("id", cooperativaId);
        return { error: humanizeError(upsertError, "configurar tu cuenta") };
      }
    }

    // 6. Inicio de sesión automático
    const cookieStore = await cookies();
    const supabaseSession = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {
              // Llamado desde un Server Component: las cookies las fija el proxy.
            }
          },
        },
      }
    );

    const { error: loginError } = await supabaseSession.auth.signInWithPassword({ email, password });
    if (loginError) {
      console.error("[registrarCooperativa] Error al iniciar sesión:", loginError);
      return {
        success: true,
        error: "Tu cooperativa quedó registrada, pero no pudimos iniciar tu sesión. Entra con tu correo y contraseña.",
      };
    }
  } catch (error) {
    console.error("[registrarCooperativa] Excepción:", error);
    return { error: humanizeError(error, "procesar el registro") };
  }

  // redirect() lanza una excepción interna: va fuera del try (docs de Next.js 16).
  redirect("/cooperativas/dashboard");
}
