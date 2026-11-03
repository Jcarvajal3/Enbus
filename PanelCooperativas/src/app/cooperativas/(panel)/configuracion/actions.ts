"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { revalidatePath } from "next/cache";
import { codigoEB, humanizeError } from "@/lib/errores";
import { normalizeRif, RIF_ERROR } from "@/lib/rif";
import { cedulaParaGuardar, telefonoParaGuardar } from "@/lib/ve";
import type {
  TipoMetodoPago,
  MetodoPagoCooperativa,
  Sucursal,
} from "@/lib/types/configuracion";

// ─────────────────────────────────────────────────────────────────────────────
// Resultado de las acciones: nunca se lanza un error al cliente (en producción
// Next.js oculta el texto de los errores lanzados en server actions). El error
// ya viene traducido con humanizeError.
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoConfig<T = null> =
  | { ok: true; data: T; error?: undefined; codigo?: undefined; campo?: undefined }
  | {
      ok: false;
      data?: undefined;
      error: string;
      /** EB_* del servidor, o "TIENE_PAGOS" / "TIENE_RELACIONES" cuando no se puede eliminar. */
      codigo?: string;
      /** Campo del formulario que causó el error. */
      campo?: string;
    };

type AdminOk = { ok: true; cooperativaId: string; cooperativaNombre: string | null; estado: string | null };

const SIN_PERMISO = "Solo el administrador de la cooperativa puede cambiar la configuración.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp"];

/** Tipo real de la imagen según sus primeros bytes (PNG, JPEG o WebP), o null. */
function tipoDeImagen(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (desde: number, hasta: number) => String.fromCharCode(...b.slice(desde, hasta));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function requireAdmin(): Promise<AdminOk | { ok: false; error: string }> {
  const user = await getUserProfile();
  if (!user) return { ok: false, error: "Tu sesión expiró. Inicia sesión de nuevo para continuar." };
  if (user.role !== "admin_cooperativa" || !user.cooperativa_id) return { ok: false, error: SIN_PERMISO };
  return {
    ok: true,
    cooperativaId: user.cooperativa_id,
    cooperativaNombre: user.cooperativa_nombre ?? null,
    estado: user.cooperativa_estado ?? null,
  };
}

function fallo(error: unknown, accion: string): { ok: false; error: string; codigo?: string } {
  return { ok: false, error: humanizeError(error, accion), codigo: codigoEB(error) ?? undefined };
}

/** Cédula o RIF del titular en el formato con que se guarda ("V-12345678" o "J-12345678-9"). */
function documentoParaGuardar(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Un RIF tiene 9 números (J-12345678-9); una cédula, hasta 8.
  if (/^[JGVEPC]\d{9}$/.test(limpio)) return normalizeRif(limpio);
  return cedulaParaGuardar(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooperativa — logo, nombre/RIF y revisión
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadLogo(formData: FormData): Promise<ResultadoConfig<{ url: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const entrada = formData.get("logo");
  const file = entrada instanceof File ? entrada : null;
  if (!file || file.size === 0) return { ok: false, error: "Elige una imagen para el logo." };
  if (!LOGO_TIPOS.includes(file.type)) {
    return { ok: false, error: "El logo debe ser una imagen PNG, JPG o WebP." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "La imagen pesa más de 2 MB. Usa una más liviana." };
  }
  // El tipo lo declara el navegador: se confirma con la firma del archivo (el bucket es público).
  const cabecera = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (tipoDeImagen(cabecera) !== file.type) {
    return { ok: false, error: "El logo debe ser una imagen PNG, JPG o WebP." };
  }

  const supabase = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${admin.cooperativaId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("logos-cooperativas")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    console.error("[uploadLogo] Error al subir:", uploadError);
    return fallo(uploadError, "subir el logo");
  }

  const { data } = supabase.storage.from("logos-cooperativas").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`; // evita la caché del navegador

  const { data: filas, error: updateError } = await supabase
    .from("cooperativas")
    .update({ logo_url: url })
    .eq("id", admin.cooperativaId)
    .select("id");
  if (updateError) {
    console.error("[uploadLogo] Error al guardar la URL:", updateError);
    return fallo(updateError, "guardar el logo");
  }
  if (!filas || filas.length === 0) return { ok: false, error: SIN_PERMISO };

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: { url } };
}

/**
 * Corrige el nombre y el RIF mientras la solicitud está en revisión o rechazada
 * (el trigger aa_proteger_cooperativa lo impide en los demás estados).
 */
export async function actualizarDatosCooperativa(input: {
  nombre: string;
  rif: string;
}): Promise<ResultadoConfig<{ nombre: string; rif: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (admin.estado !== "PENDIENTE" && admin.estado !== "RECHAZADA") {
    return {
      ok: false,
      error: "El nombre y el RIF solo se corrigen mientras la solicitud está en revisión. Escríbenos para cambiarlos.",
    };
  }

  const nombre = (input.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) {
    return { ok: false, error: "Escribe el nombre de la cooperativa (mínimo 3 caracteres).", campo: "nombre" };
  }
  const rif = normalizeRif(input.rif);
  if (!rif) return { ok: false, error: RIF_ERROR, campo: "rif" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cooperativas")
    .update({ nombre, rif })
    .eq("id", admin.cooperativaId);
  if (error) {
    console.error("[actualizarDatosCooperativa] Error:", error);
    const res = fallo(error, "guardar los datos de la cooperativa");
    return error.code === "23505"
      ? { ...res, error: "Ya existe otra cooperativa registrada con este RIF.", campo: "rif" }
      : res;
  }

  revalidatePath("/cooperativas", "layout");
  return { ok: true, data: { nombre, rif } };
}

/** Pide una nueva revisión de una solicitud rechazada (fn_solicitar_revision_cooperativa). */
export async function solicitarRevision(mensaje?: string): Promise<ResultadoConfig<{ ya_procesado: boolean }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const texto = (mensaje ?? "").trim().slice(0, 1000);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_solicitar_revision_cooperativa", {
    p_mensaje: texto || null,
  });
  if (error) {
    console.error("[solicitarRevision] Error:", error);
    return fallo(error, "pedir la nueva revisión");
  }

  // El estado de la cooperativa viene del layout (banner y menú): se recarga todo el panel.
  revalidatePath("/cooperativas", "layout");
  const r = (data ?? {}) as { ya_procesado?: boolean };
  return { ok: true, data: { ya_procesado: Boolean(r.ya_procesado) } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métodos de Pago
// ─────────────────────────────────────────────────────────────────────────────

export type MetodoPagoInput = {
  tipo: TipoMetodoPago;
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
  instrucciones: string | null;
};

/** Valida y normaliza los campos según el tipo (los que no aplican se guardan vacíos). */
function prepararMetodo(
  input: MetodoPagoInput,
  cooperativaNombre: string | null
): { ok: true; data: MetodoPagoInput } | { ok: false; error: string; campo: string } {
  const titular = (input.titular ?? "").trim().replace(/\s+/g, " ");
  const banco = (input.banco ?? "").trim() || null;
  const instrucciones = (input.instrucciones ?? "").trim() || null;

  switch (input.tipo) {
    case "PAGO_MOVIL": {
      if (!banco) return { ok: false, error: "Elige el banco del Pago Móvil.", campo: "banco" };
      const telefono = telefonoParaGuardar(input.numero_cuenta);
      if (!telefono) {
        return { ok: false, error: "Escribe el teléfono del Pago Móvil, por ejemplo 0414-1234567.", campo: "numero_cuenta" };
      }
      const documento = documentoParaGuardar(input.cedula_rif);
      if (!documento) {
        return { ok: false, error: "Escribe la cédula o el RIF del titular, por ejemplo V-12345678.", campo: "cedula_rif" };
      }
      if (titular.length < 3) return { ok: false, error: "Escribe el nombre del titular.", campo: "titular" };
      return {
        ok: true,
        data: { tipo: input.tipo, banco, titular, numero_cuenta: telefono, cedula_rif: documento, email_zelle: null, instrucciones },
      };
    }
    case "TRANSFERENCIA_BANCARIA": {
      if (!banco) return { ok: false, error: "Elige el banco de la cuenta.", campo: "banco" };
      const cuenta = (input.numero_cuenta ?? "").replace(/\D/g, "");
      if (cuenta.length !== 20) {
        return { ok: false, error: "El número de cuenta debe tener 20 dígitos.", campo: "numero_cuenta" };
      }
      const documento = documentoParaGuardar(input.cedula_rif);
      if (!documento) {
        return { ok: false, error: "Escribe la cédula o el RIF del titular, por ejemplo J-12345678-9.", campo: "cedula_rif" };
      }
      if (titular.length < 3) return { ok: false, error: "Escribe el nombre del titular de la cuenta.", campo: "titular" };
      return {
        ok: true,
        data: { tipo: input.tipo, banco, titular, numero_cuenta: cuenta, cedula_rif: documento, email_zelle: null, instrucciones },
      };
    }
    case "ZELLE": {
      const email = (input.email_zelle ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return { ok: false, error: "Escribe el correo de Zelle, por ejemplo pagos@tucooperativa.com.", campo: "email_zelle" };
      }
      if (titular.length < 3) return { ok: false, error: "Escribe el nombre del titular de la cuenta Zelle.", campo: "titular" };
      return {
        ok: true,
        data: { tipo: input.tipo, banco: null, titular, numero_cuenta: null, cedula_rif: null, email_zelle: email, instrucciones },
      };
    }
    case "EFECTIVO":
      return {
        ok: true,
        data: {
          tipo: input.tipo,
          banco: null,
          // `titular` es obligatorio en la tabla: en efectivo se guarda el nombre de la cooperativa.
          titular: titular || cooperativaNombre || "Efectivo en taquilla",
          numero_cuenta: null,
          cedula_rif: null,
          email_zelle: null,
          instrucciones,
        },
      };
    default:
      return { ok: false, error: "Elige el tipo de método de pago.", campo: "tipo" };
  }
}

export async function crearMetodoPago(input: MetodoPagoInput): Promise<ResultadoConfig<MetodoPagoCooperativa>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const preparado = prepararMetodo(input, admin.cooperativaNombre);
  if (!preparado.ok) return preparado;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metodos_pago_cooperativa")
    .insert({ ...preparado.data, cooperativa_id: admin.cooperativaId, activo: true })
    .select()
    .single();
  if (error || !data) {
    console.error("[crearMetodoPago] Error:", error);
    return fallo(error, "guardar el método de pago");
  }

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: data as MetodoPagoCooperativa };
}

export async function actualizarMetodoPago(
  id: string,
  input: MetodoPagoInput
): Promise<ResultadoConfig<MetodoPagoInput>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos ese método. Actualiza la página." };
  const preparado = prepararMetodo(input, admin.cooperativaNombre);
  if (!preparado.ok) return preparado;

  const supabase = await createClient();
  const { data: filas, error } = await supabase
    .from("metodos_pago_cooperativa")
    .update(preparado.data)
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId)
    .select("id");
  if (error) {
    console.error("[actualizarMetodoPago] Error:", error);
    return fallo(error, "guardar el método de pago");
  }
  // Sin filas: el método no existe o no es de esta cooperativa (nunca un éxito falso).
  if (!filas || filas.length === 0) return { ok: false, error: "No encontramos ese método. Actualiza la página." };

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: preparado.data };
}

/** Activa o desactiva un método (los pasajeros solo ven los activos). */
export async function cambiarActivoMetodoPago(id: string, activo: boolean): Promise<ResultadoConfig> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos ese método. Actualiza la página." };

  const supabase = await createClient();
  const { data: filas, error } = await supabase
    .from("metodos_pago_cooperativa")
    .update({ activo })
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId)
    .select("id");
  if (error) {
    console.error("[cambiarActivoMetodoPago] Error:", error);
    return fallo(error, activo ? "activar el método de pago" : "desactivar el método de pago");
  }
  if (!filas || filas.length === 0) return { ok: false, error: "No encontramos ese método. Actualiza la página." };

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: null };
}

export async function eliminarMetodoPago(id: string): Promise<ResultadoConfig> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos ese método. Actualiza la página." };

  const supabase = await createClient();
  const { data: filas, error } = await supabase
    .from("metodos_pago_cooperativa")
    .delete()
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId)
    .select("id");
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Este método ya tiene pagos registrados y no se puede eliminar. Desactívalo para que no aparezca.",
        codigo: "TIENE_PAGOS",
      };
    }
    console.error("[eliminarMetodoPago] Error:", error);
    return fallo(error, "eliminar el método de pago");
  }
  if (!filas || filas.length === 0) return { ok: false, error: "No encontramos ese método. Actualiza la página." };

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sucursales
// ─────────────────────────────────────────────────────────────────────────────

export type SucursalInput = {
  nombre: string;
  /** Clave de lib/data/venezuela.ts ("carabobo"); se guarda en `estado_geografico`. */
  estado: string;
  /** Clave de lib/data/venezuela.ts ("valencia"), igual que en las rutas. */
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
};

/** Fila de sucursal tal como la guarda la tabla (con las columnas de la fase 3). */
export type SucursalGuardada = Sucursal;

function prepararSucursal(
  input: SucursalInput
): { ok: true; data: Record<string, string | null> } | { ok: false; error: string; campo: string } {
  const nombre = (input.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) return { ok: false, error: "Escribe el nombre de la sucursal (mínimo 3 caracteres).", campo: "nombre" };
  if (!input.estado) return { ok: false, error: "Elige el estado donde queda la sucursal.", campo: "estado" };
  if (!input.ciudad) return { ok: false, error: "Elige la ciudad donde queda la sucursal.", campo: "ciudad" };
  const direccion = (input.direccion ?? "").trim();
  if (direccion.length < 5) {
    return { ok: false, error: "Escribe la dirección para que los clientes la encuentren.", campo: "direccion" };
  }
  const telefonoTexto = (input.telefono ?? "").trim();
  let telefono: string | null = null;
  if (telefonoTexto) {
    telefono = telefonoParaGuardar(telefonoTexto);
    if (!telefono) {
      return { ok: false, error: "Escribe un teléfono venezolano, por ejemplo 0241-1234567.", campo: "telefono" };
    }
  }
  return {
    ok: true,
    data: {
      nombre,
      estado_geografico: input.estado,
      ciudad: input.ciudad,
      direccion,
      telefono,
      horario: (input.horario ?? "").trim().slice(0, 120) || null,
    },
  };
}

/** 42703/PGRST204: la columna `horario` aún no existe (migración 20260720000002 sin aplicar). */
function sinColumnaHorario(fallaDb: { code?: string; message?: string } | null): boolean {
  if (!fallaDb || (fallaDb.code !== "42703" && fallaDb.code !== "PGRST204")) return false;
  return /horario/i.test(fallaDb.message ?? "");
}

function sinHorario(fila: Record<string, string | null>): Record<string, string | null> {
  const resto = { ...fila };
  delete resto.horario;
  return resto;
}

export async function crearSucursal(input: SucursalInput): Promise<ResultadoConfig<SucursalGuardada>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const preparado = prepararSucursal(input);
  if (!preparado.ok) return preparado;

  const supabase = await createClient();
  const insertar = (fila: Record<string, string | null>) =>
    supabase
      .from("sucursales")
      .insert({ ...fila, cooperativa_id: admin.cooperativaId, activa: true })
      .select()
      .single();
  let { data, error } = await insertar(preparado.data);
  if (sinColumnaHorario(error)) ({ data, error } = await insertar(sinHorario(preparado.data)));
  if (error || !data) {
    console.error("[crearSucursal] Error:", error);
    return fallo(error, "crear la sucursal");
  }

  revalidatePath("/cooperativas/configuracion");
  revalidatePath("/cooperativas/empleados");
  return { ok: true, data: data as SucursalGuardada };
}

export async function actualizarSucursal(id: string, input: SucursalInput): Promise<ResultadoConfig<SucursalGuardada>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };
  const preparado = prepararSucursal(input);
  if (!preparado.ok) return preparado;

  const supabase = await createClient();
  const actualizar = (fila: Record<string, string | null>) =>
    supabase
      .from("sucursales")
      .update(fila)
      .eq("id", id)
      .eq("cooperativa_id", admin.cooperativaId)
      .select()
      .single();
  let { data, error } = await actualizar(preparado.data);
  if (sinColumnaHorario(error)) ({ data, error } = await actualizar(sinHorario(preparado.data)));
  if (error || !data) {
    console.error("[actualizarSucursal] Error:", error);
    return fallo(error, "guardar la sucursal");
  }

  revalidatePath("/cooperativas/configuracion");
  revalidatePath("/cooperativas/empleados");
  return { ok: true, data: data as SucursalGuardada };
}

export async function cambiarActivaSucursal(id: string, activa: boolean): Promise<ResultadoConfig> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };

  const supabase = await createClient();
  const { data: filas, error } = await supabase
    .from("sucursales")
    .update({ activa })
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId)
    .select("id");
  if (error) {
    console.error("[cambiarActivaSucursal] Error:", error);
    return fallo(error, activa ? "activar la sucursal" : "desactivar la sucursal");
  }
  if (!filas || filas.length === 0) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };

  revalidatePath("/cooperativas/configuracion");
  return { ok: true, data: null };
}

export async function eliminarSucursal(id: string): Promise<ResultadoConfig> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };

  const supabase = await createClient();
  const MSG_RELACIONES =
    "Esta sucursal tiene empleados, invitaciones o encomiendas. Desactívala en lugar de eliminarla.";

  // Los empleados se desasignarían en silencio (ON DELETE SET NULL): se impide antes.
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("sucursal_id", id);
  if (countError) {
    console.error("[eliminarSucursal] Error al contar empleados:", countError);
    return fallo(countError, "eliminar la sucursal");
  }
  if ((count ?? 0) > 0) return { ok: false, error: MSG_RELACIONES, codigo: "TIENE_RELACIONES" };

  const { data: filas, error } = await supabase
    .from("sucursales")
    .delete()
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId)
    .select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, error: MSG_RELACIONES, codigo: "TIENE_RELACIONES" };
    console.error("[eliminarSucursal] Error:", error);
    return fallo(error, "eliminar la sucursal");
  }
  if (!filas || filas.length === 0) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };

  revalidatePath("/cooperativas/configuracion");
  revalidatePath("/cooperativas/empleados");
  return { ok: true, data: null };
}
