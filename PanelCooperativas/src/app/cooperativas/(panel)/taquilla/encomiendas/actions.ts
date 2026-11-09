"use server";

// ─── Taquilla de encomiendas: recepción en origen y cobro en mostrador ──────
// Orden en el mostrador: recepción → foto → cobro (solo si paga quien envía).
// El costo y el cobro los decide el servidor (RPC SECURITY DEFINER, fases 2 y 3):
// - fn_registrar_encomienda_taquilla da de alta, recibe y pesa en una operación
//   una encomienda de un cliente sin la app (queda POR_PAGAR con su PIN).
// - fn_rechazar_encomienda_origen cancela una encomienda que no se recibe.
// - fn_confirmar_recepcion_origen pesa la encomienda y calcula el costo en USD.
// - fn_cobrar_encomienda_taquilla registra el cobro (efectivo Bs/USD, punto de venta,
//   Pago Móvil, transferencia o Zelle) a la tasa BCV del día, de forma idempotente.
// - Los pagos que el cliente reportó desde la app se aprueban con aprobarPago
//   (pagos/actions), que también pasa la encomienda a PAGADA si estaba por pagar.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, errorDeFuncion, humanizeError, parseDetalleEB, type DetalleEB } from "@/lib/errores";
import { aprobarPago } from "@/app/cooperativas/(panel)/pagos/actions";
import { cedulaParaGuardar, telefonoParaGuardar } from "@/lib/ve";
import { rutaDeFoto } from "@/lib/fotos";
import type {
  ModalidadPago,
  PersonaEncomienda,
  RegistroEncomiendaTaquilla,
  ResultadoRechazoEncomienda,
} from "@/lib/types/encomiendas";
import type {
  CobroEncomienda,
  EstadoVerificacion,
  MonedaPago,
  RecepcionOrigen,
  TipoMetodoPago,
} from "@/lib/types/pagos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_NO_ENCONTRADA = "No encontramos esta encomienda. Actualiza la lista e intenta de nuevo.";

export type ResultadoTaquilla<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined; detalle?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      /** Código EB_* del servidor, si lo hubo. */
      codigo?: string;
      /** `details` del error EB_* (p. ej. `campo` para marcar el dato a corregir). */
      detalle?: DetalleEB;
    };

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string; detalle?: DetalleEB } {
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo: codigoEB(error) ?? undefined,
    detalle: parseDetalleEB(error),
  };
}

/** Pantallas que muestran el estado de cobro de una encomienda. */
function revalidarPantallasDeEncomienda() {
  revalidatePath("/cooperativas/taquilla/encomiendas");
  revalidatePath("/cooperativas/pagos");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/entrega");
}

// ─── Recepción en origen ────────────────────────────────────────────────────

/**
 * Recibe y pesa la encomienda (PENDIENTE_DE_ESCANEO o EN_RECEPCION → POR_PAGAR).
 * El costo lo calcula el servidor con la tarifa vigente; luego se genera la guía PDF.
 * Repetir la llamada con el mismo peso es seguro (`repetido`).
 */
export async function confirmarRecepcion(
  encomiendaId: string,
  peso: number
): Promise<ResultadoTaquilla<RecepcionOrigen> & { pdfUrl?: string | null; avisoGuia?: string }> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  if (!Number.isFinite(peso) || peso <= 0) {
    return {
      success: false,
      error: "Escribe un peso mayor que 0 kg.",
      codigo: "EB_PESO_INVALIDO",
      detalle: { campo: "peso" },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_confirmar_recepcion_origen", {
    p_encomienda_id: encomiendaId,
    p_peso_kg: peso,
  });
  if (error) {
    console.error("Error al confirmar la recepción de la encomienda:", error);
    return fallo(error, "recibir la encomienda");
  }

  // Guía PDF (si falla, la recepción ya quedó registrada: se puede reimprimir desde la lista).
  let pdfUrl: string | null = null;
  let avisoGuia: string | undefined;
  try {
    const { data: pdfData, error: pdfError } = await supabase.functions.invoke("generar-guia-pdf", {
      body: { encomienda_id: encomiendaId },
    });
    if (pdfError) throw await errorDeFuncion(pdfError);
    pdfUrl = pdfData?.pdf_url || null;
    if (!pdfUrl) throw new Error("generar-guia-pdf respondió sin pdf_url");
  } catch (pdfError) {
    console.error("Error al generar el PDF de la guía:", pdfError);
    const motivo = codigoEB(pdfError) ? ` ${humanizeError(pdfError, "generar la guía")}` : "";
    avisoGuia = `La encomienda quedó recibida, pero la guía en PDF no se pudo generar.${motivo} Reimprímela desde la lista.`;
  }

  revalidarPantallasDeEncomienda();
  return { success: true, data: data as RecepcionOrigen, pdfUrl, avisoGuia };
}

// ─── Cobro en taquilla (origen o destino) ───────────────────────────────────

export type CobrarEncomiendaInput = {
  encomiendaId: string;
  metodoTipo: TipoMetodoPago;
  /** Cuenta de la cooperativa que recibió el pago (opcional; se valida en el servidor; no en punto de venta). */
  metodoPagoId?: string | null;
  /** Solo efectivo: 'VES' o 'USD'. */
  moneda?: MonedaPago | null;
  /** Solo efectivo: lo que entregó el cliente, en `moneda`. */
  montoRecibido?: number | null;
  referencia?: string | null;
  /** 'YYYY-MM-DD' (hora de Venezuela). */
  fecha?: string | null;
  banco?: string | null;
  /** Clave de idempotencia: la misma en los reintentos de un mismo cobro. */
  idemKey: string;
};

const METODOS: TipoMetodoPago[] = ["EFECTIVO", "PUNTO_DE_VENTA", "PAGO_MOVIL", "TRANSFERENCIA_BANCARIA", "ZELLE"];

/** Registra un cobro hecho en la taquilla (queda aprobado; POR_PAGAR pasa a PAGADA). */
export async function cobrarEncomienda(input: CobrarEncomiendaInput): Promise<ResultadoTaquilla<CobroEncomienda>> {
  if (!UUID_RE.test(input?.encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  if (!METODOS.includes(input.metodoTipo)) {
    return { success: false, error: "Elige cómo pagó el cliente.", codigo: "EB_METODO_INVALIDO" };
  }
  if (!input.idemKey || input.idemKey.length < 8) {
    return { success: false, error: "Falta la clave de la operación. Cierra la ventana y vuelve a abrirla." };
  }
  const efectivo = input.metodoTipo === "EFECTIVO";
  // Punto de venta: solo referencia del comprobante y fecha (sin cuenta ni banco).
  const puntoVenta = input.metodoTipo === "PUNTO_DE_VENTA";
  const metodoPagoId =
    !puntoVenta && input.metodoPagoId && UUID_RE.test(input.metodoPagoId) ? input.metodoPagoId : null;
  const fecha = input.fecha && FECHA_RE.test(input.fecha) ? input.fecha : null;
  const monto =
    efectivo && typeof input.montoRecibido === "number" && Number.isFinite(input.montoRecibido)
      ? input.montoRecibido
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cobrar_encomienda_taquilla", {
    p_encomienda_id: input.encomiendaId,
    p_metodo_tipo: input.metodoTipo,
    p_metodo_pago_id: efectivo ? null : metodoPagoId,
    p_moneda: efectivo ? (input.moneda === "USD" ? "USD" : "VES") : null,
    p_monto_recibido: monto,
    p_numero_referencia: efectivo ? null : (input.referencia ?? "").trim() || null,
    p_fecha_transaccion: efectivo ? null : fecha,
    p_banco_emisor: efectivo || puntoVenta ? null : (input.banco ?? "").trim() || null,
    p_idempotency_key: input.idemKey,
  });
  if (error) {
    console.error("Error al cobrar la encomienda:", error);
    return fallo(error, "registrar el cobro");
  }

  revalidarPantallasDeEncomienda();
  return { success: true, data: data as CobroEncomienda };
}

/**
 * Envoltorio único de cobro:
 * - con `pagoPendienteId` aprueba el pago que el cliente reportó desde la app;
 * - con `cobro` registra el cobro hecho en la taquilla.
 * Sin ninguno de los dos no hace nada y lo dice (nunca devuelve un éxito falso).
 */
export async function procesarPago(args: {
  encomiendaId: string;
  pagoPendienteId?: string | null;
  cobro?: Omit<CobrarEncomiendaInput, "encomiendaId">;
}): Promise<ResultadoTaquilla<{ aprobado: boolean; cobro?: CobroEncomienda }>> {
  if (args.pagoPendienteId) {
    const res = await aprobarPago(args.pagoPendienteId);
    if (!res.success) return { success: false, error: res.error, codigo: res.codigo };
    return { success: true, data: { aprobado: true } };
  }
  if (args.cobro) {
    const res = await cobrarEncomienda({ ...args.cobro, encomiendaId: args.encomiendaId });
    if (!res.success) return res;
    return { success: true, data: { aprobado: true, cobro: res.data } };
  }
  return {
    success: false,
    error: "El cliente no ha reportado ningún pago. Elige cómo pagó y registra el cobro.",
  };
}

// ─── Estado de cobro de una encomienda ─────────────────────────────────────

export type EstadoCobroEncomienda = {
  /** Hay un pago aprobado (cobrado en taquilla o verificado). */
  aprobado: boolean;
  /** Pago reportado por el cliente que falta verificar. */
  pendiente: { id: string; numeroReferencia: string | null; creadoAt: string | null } | null;
  /** Último pago rechazado (para avisar al taquillero). */
  rechazado: { motivo: string | null; numeroReferencia: string | null } | null;
};

/** Pagos de la encomienda vistos por el personal de la cooperativa (solo lectura). */
export async function obtenerEstadoCobro(encomiendaId: string): Promise<ResultadoTaquilla<EstadoCobroEncomienda>> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos")
    .select("id, estado_verificacion, motivo_rechazo, numero_referencia, created_at")
    .eq("encomienda_id", encomiendaId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error al leer los pagos de la encomienda:", error);
    return fallo(error, "revisar el pago de la encomienda");
  }

  const pagos = (data ?? []) as {
    id: string;
    estado_verificacion: EstadoVerificacion;
    motivo_rechazo: string | null;
    numero_referencia: string | null;
    created_at: string | null;
  }[];
  const pendiente = pagos.find((p) => p.estado_verificacion === "PENDIENTE");
  const rechazado = pagos.find((p) => p.estado_verificacion === "RECHAZADO");
  return {
    success: true,
    data: {
      aprobado: pagos.some((p) => p.estado_verificacion === "APROBADO"),
      pendiente: pendiente
        ? { id: pendiente.id, numeroReferencia: pendiente.numero_referencia, creadoAt: pendiente.created_at }
        : null,
      rechazado: rechazado
        ? { motivo: rechazado.motivo_rechazo, numeroReferencia: rechazado.numero_referencia }
        : null,
    },
  };
}

// ─── Alta presencial (cliente sin la app) ───────────────────────────────────

export type SucursalAlta = { id: string; nombre: string; ciudad: string; estado_geografico: string };
export type RutaAlta = {
  id: string;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  duracion_estimada_min: number | null;
};

export type DatosAltaEncomienda = {
  /** Sucursal asignada al usuario (null: debe elegir dónde recibe). */
  sucursalUsuarioId: string | null;
  sucursales: SucursalAlta[];
  /** Rutas activas de la cooperativa (el cliente filtra las que salen de la sucursal). */
  rutas: RutaAlta[];
};

/** Sucursales activas y rutas activas para el formulario de alta presencial. */
export async function datosNuevaEncomienda(): Promise<ResultadoTaquilla<DatosAltaEncomienda>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Tu sesión expiró. Inicia sesión de nuevo para continuar." };

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("cooperativa_id, sucursal_id")
    .eq("id", user.id)
    .maybeSingle();
  if (perfilError) {
    console.error("Error al leer el perfil para el alta de encomienda:", perfilError);
    return fallo(perfilError, "cargar tus sucursales");
  }
  if (!perfil?.cooperativa_id) {
    return { success: false, error: "Tu usuario no está asociado a una cooperativa. Avísale al administrador." };
  }

  const [sucursales, rutas] = await Promise.all([
    supabase
      .from("sucursales")
      .select("id, nombre, ciudad, estado_geografico")
      .eq("cooperativa_id", perfil.cooperativa_id)
      .eq("activa", true)
      .order("nombre", { ascending: true }),
    supabase
      .from("rutas")
      .select("id, estado_origen, ciudad_origen, estado_destino, ciudad_destino, duracion_estimada_min")
      .eq("cooperativa_id", perfil.cooperativa_id)
      .eq("activa", true)
      .order("ciudad_destino", { ascending: true }),
  ]);
  if (sucursales.error || rutas.error) {
    const error = sucursales.error ?? rutas.error;
    console.error("Error al cargar sucursales y rutas para el alta:", error);
    return fallo(error, "cargar las sucursales y las rutas");
  }

  const lista = (sucursales.data ?? []) as SucursalAlta[];
  const propia = perfil.sucursal_id && lista.some((s) => s.id === perfil.sucursal_id) ? perfil.sucursal_id : null;
  return {
    success: true,
    data: { sucursalUsuarioId: propia, sucursales: lista, rutas: (rutas.data ?? []) as RutaAlta[] },
  };
}

export type RegistrarEncomiendaInput = {
  rutaId: string;
  remitente: PersonaEncomienda;
  destinatario: PersonaEncomienda;
  descripcion: string;
  valorDeclarado?: number | null;
  modalidad: ModalidadPago;
  pesoKg: number;
  /** Clave de idempotencia creada al abrir el formulario (la misma en los reintentos). */
  idemKey: string;
  /** Solo si el usuario no tiene sucursal asignada. */
  sucursalId?: string | null;
};

function personaParaGuardar(p: PersonaEncomienda): PersonaEncomienda {
  return {
    nombre: (p?.nombre ?? "").trim().replace(/\s+/g, " "),
    cedula: cedulaParaGuardar(p?.cedula) ?? (p?.cedula ?? "").trim(),
    telefono: telefonoParaGuardar(p?.telefono) ?? (p?.telefono ?? "").trim(),
  };
}

/**
 * Alta presencial: crea, recibe y pesa la encomienda (queda POR_PAGAR con su
 * costo y su PIN). Con la misma `idemKey` devuelve la ya creada (`repetido`,
 * sin costo en Bs ni tasa: se calculan con la tasa del día).
 */
export async function registrarEncomiendaTaquilla(
  input: RegistrarEncomiendaInput
): Promise<ResultadoTaquilla<RegistroEncomiendaTaquilla>> {
  if (!UUID_RE.test(input?.rutaId ?? "")) {
    return { success: false, error: "Elige el destino del envío.", codigo: "EB_SIN_RUTA", detalle: { campo: "destino" } };
  }
  if (!input.idemKey || input.idemKey.length < 8) {
    return { success: false, error: "Falta la clave de la operación. Cierra la ventana y vuelve a abrirla." };
  }
  if (!Number.isFinite(input.pesoKg) || input.pesoKg <= 0) {
    return { success: false, error: "Escribe un peso mayor que 0 kg.", codigo: "EB_PESO_INVALIDO", detalle: { campo: "peso" } };
  }
  if (input.modalidad !== "ORIGEN" && input.modalidad !== "DESTINO") {
    return { success: false, error: "Elige quién paga el envío.", detalle: { campo: "modalidad" } };
  }
  const valor =
    typeof input.valorDeclarado === "number" && Number.isFinite(input.valorDeclarado) ? input.valorDeclarado : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_registrar_encomienda_taquilla", {
    p_ruta_id: input.rutaId,
    p_remitente: personaParaGuardar(input.remitente),
    p_destinatario: personaParaGuardar(input.destinatario),
    p_descripcion: (input.descripcion ?? "").trim(),
    p_valor_declarado: valor,
    p_modalidad_pago: input.modalidad,
    p_peso_kg: input.pesoKg,
    p_idempotency_key: input.idemKey,
    p_sucursal_id: input.sucursalId && UUID_RE.test(input.sucursalId) ? input.sucursalId : null,
  });
  if (error) {
    console.error("Error al registrar la encomienda en taquilla:", error);
    return fallo(error, "registrar la encomienda");
  }

  revalidarPantallasDeEncomienda();
  return { success: true, data: data as RegistroEncomiendaTaquilla };
}

// ─── No recibir una encomienda ──────────────────────────────────────────────

/** Cancela una encomienda que la taquilla no recibe (sin ruta, contenido no permitido…) y avisa al cliente. */
export async function rechazarEncomienda(
  encomiendaId: string,
  motivo: string
): Promise<ResultadoTaquilla<ResultadoRechazoEncomienda>> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  const texto = (motivo ?? "").trim();
  if (texto.length < 5) {
    return {
      success: false,
      error: "Escribe por qué no recibes la encomienda (mínimo 5 caracteres).",
      detalle: { campo: "motivo" },
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rechazar_encomienda_origen", {
    p_encomienda_id: encomiendaId,
    p_motivo: texto,
  });
  if (error) {
    console.error("Error al rechazar la encomienda:", error);
    return fallo(error, "rechazar la encomienda");
  }
  revalidarPantallasDeEncomienda();
  return { success: true, data: data as ResultadoRechazoEncomienda };
}

// ─── Foto de la taquilla ────────────────────────────────────────────────────

/**
 * Guarda la foto que tomó la taquilla (la RUTA del objeto en el bucket privado,
 * nunca una URL) o el motivo por el que se omitió.
 */
export async function guardarFotoEncomienda(
  encomiendaId: string,
  foto: { ruta: string } | { omitidaMotivo: string }
): Promise<ResultadoTaquilla<{ ok: true }>> {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };

  let cambios: { foto_evidencia_url?: string; foto_omitida_motivo: string | null };
  if ("ruta" in foto) {
    const ruta = rutaDeFoto(foto.ruta);
    // Solo "<encomiendaId>/<archivo>": sin ".." ni subcarpetas que apunten a la foto de otra encomienda.
    if (!ruta || !ruta.startsWith(`${encomiendaId}/`) || !/^[0-9a-f-]{36}\/[\w.-]{1,80}$/i.test(ruta) || ruta.includes("..")) {
      return { success: false, error: "No pudimos subir la foto. Intenta de nuevo o súbela después desde el detalle." };
    }
    cambios = { foto_evidencia_url: ruta, foto_omitida_motivo: null };
  } else {
    const motivo = (foto.omitidaMotivo ?? "").trim().slice(0, 300);
    if (motivo.length < 3) {
      return { success: false, error: "Elige o escribe por qué omites la foto.", detalle: { campo: "motivo" } };
    }
    cambios = { foto_omitida_motivo: motivo };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("encomiendas").update(cambios).eq("id", encomiendaId).select("id");
  if (error) {
    console.error("Error al guardar la foto de la encomienda:", error);
    return fallo(error, "guardar la foto");
  }
  if (!data || data.length === 0) return { success: false, error: MSG_NO_ENCONTRADA };

  revalidatePath("/cooperativas/taquilla/encomiendas");
  return { success: true, data: { ok: true } };
}

// ─── Guía PDF ────────────────────────────────────────────────────────────────

export async function obtenerPdfGuia(encomiendaId: string) {
  if (!UUID_RE.test(encomiendaId ?? "")) return { success: false, error: MSG_NO_ENCONTRADA };
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("generar-guia-pdf", {
    body: { encomienda_id: encomiendaId },
  });
  if (error) {
    const detalle = await errorDeFuncion(error);
    console.error("Error al obtener PDF de guía:", detalle);
    return { success: false, error: humanizeError(detalle, "obtener la guía en PDF") };
  }
  const pdfUrl: string | null = data?.pdf_url || null;
  if (!pdfUrl) return { success: false, error: "No pudimos obtener la guía en PDF. Intenta de nuevo en un momento." };
  return { success: true, pdfUrl };
}
