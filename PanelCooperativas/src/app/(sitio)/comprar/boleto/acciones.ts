"use server";

// ─── Compra de boletos: server actions del pasajero ──────────────────────────
// Cliente de sesión (`createClient`): las RPC corren como el pasajero. Cada acción valida lo
// que recibe (uuid, arrays, longitudes) y devuelve `{ success, data | error, codigo?, detalle? }`
// con el código EB_* de Postgres ya traducido (`mensajeErrorCompra`). Las reglas de dinero, tasa
// y asientos las decide el servidor de base de datos; aquí solo se transporta.

import { cedulaValida } from "@/lib/ve";
import { codigoEB, humanizeError, MSG, parseDetalleEB } from "@/lib/errores";
import { mensajeErrorCompra } from "@/lib/pasajero/errores-compra";
import { createClient } from "@/lib/supabase/server";
import { normalizarPago } from "@/components/pasajero/cuenta/servidor";
import {
  MAX_ASIENTOS,
  type PagoCompra,
  type ResultadoAccion,
  type ResumenCompra,
  type SugerenciaPasajero,
} from "@/components/pasajero/compra-boleto/tipos";

// ─── Utilidades ──────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASIENTO = /^[1-9][0-9]{0,2}$/;
const CLAVE = /^[A-Za-z0-9_-]{8,100}$/;

type Fila = Record<string, unknown>;

const esFila = (v: unknown): v is Fila => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numeroONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function invalido(error = "No pudimos procesar la solicitud. Actualiza la página e intenta de nuevo."): {
  success: false;
  error: string;
} {
  return { success: false, error };
}

/** Error de Postgres/PostgREST → respuesta con el código EB_* y su detalle, si lo trae. */
function fallo(err: unknown, accion: string): { success: false; error: string; codigo?: string; detalle?: ReturnType<typeof parseDetalleEB> } {
  const codigo = codigoEB(err);
  if (!codigo) return { success: false, error: humanizeError(err, accion) };
  const detalle = parseDetalleEB(err);
  const hint = esFila(err) && typeof err.hint === "string" ? err.hint : null;
  return { success: false, error: mensajeErrorCompra(codigo, detalle, hint), codigo, detalle };
}

/** Asientos únicos, válidos ("1".."999") y como mucho 10; null si algo no cuadra. */
function asientosValidos(entrada: unknown): string[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0 || entrada.length > MAX_ASIENTOS) return null;
  const lista: string[] = [];
  for (const a of entrada) {
    if (typeof a !== "string" || !ASIENTO.test(a)) return null;
    if (!lista.includes(a)) lista.push(a);
  }
  return lista;
}

function aPago(v: unknown): PagoCompra | null {
  if (!esFila(v)) return null;
  return {
    estado: texto(v.estado),
    montoUsd: numeroONull(v.monto_usd),
    montoBs: numeroONull(v.monto_bs),
    tasa: numeroONull(v.tasa_bcv),
    tasaFecha: texto(v.tasa_bcv_fecha) || null,
    moneda: texto(v.moneda) || null,
  };
}

/** `_resumen_compra` (+ campos extra de cada RPC) en un objeto tipado. */
function aResumen(data: unknown): ResumenCompra {
  const d = esFila(data) ? data : {};
  const boletos = Array.isArray(d.boletos) ? d.boletos : [];
  return {
    compraId: texto(d.compra_id),
    serverNow: texto(d.server_now) || null,
    viajeId: texto(d.viaje_id) || null,
    boletos: boletos.filter(esFila).map((b) => ({
      id: texto(b.id),
      codigoBoleto: texto(b.codigo_boleto),
      asiento: texto(b.asiento),
      estado: texto(b.estado),
      precioUsd: numeroONull(b.precio_usd) ?? 0,
    })),
    totalUsd: numeroONull(d.total_usd),
    reservaExpiraAt: texto(d.reserva_expira_at) || null,
    pago: aPago(d.pago),
    tasa: numeroONull(d.tasa_bcv),
    tasaFecha: texto(d.tasa_bcv_fecha) || null,
    totalBs: numeroONull(d.total_bs),
    repetido: d.repetido === true,
  };
}

async function haySesion() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const uid = error ? null : data?.claims?.sub;
  return { supabase, uid: typeof uid === "string" && uid ? uid : null };
}

const SIN_SESION = { success: false, error: MSG.sesionVencida, codigo: "EB_NO_AUTENTICADO" } as const;

// ─── Asientos ────────────────────────────────────────────────────────────────

/** Asientos ocupados del viaje (reservados, pagados o usados), tal como los guarda la base. */
export async function leerAsientosOcupados(viajeId: string): Promise<ResultadoAccion<string[]>> {
  if (!UUID.test(viajeId)) return invalido();
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  const { data, error } = await supabase.rpc("fn_asientos_ocupados", { p_viaje_id: viajeId });
  if (error) return fallo(error, "cargar los asientos");
  const lista = Array.isArray(data) ? data.filter((a): a is string => typeof a === "string") : [];
  return { success: true, data: lista };
}

/** Aparta los asientos 30 minutos (`fn_reservar_asientos`). Repetir con la misma compra es seguro. */
export async function reservarAsientos(entrada: {
  compraId: string;
  viajeId: string;
  asientos: string[];
}): Promise<ResultadoAccion<ResumenCompra>> {
  const asientos = asientosValidos(entrada?.asientos);
  if (!UUID.test(entrada?.compraId ?? "") || !UUID.test(entrada?.viajeId ?? "") || !asientos) return invalido();
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  const { data, error } = await supabase.rpc("fn_reservar_asientos", {
    p_compra_id: entrada.compraId,
    p_viaje_id: entrada.viajeId,
    p_asientos: asientos,
  });
  if (error) return fallo(error, "apartar tus asientos");
  return { success: true, data: aResumen(data) };
}

/** Suelta los asientos de una compra sin pago (mejor esfuerzo; si falla, el cron los libera). */
export async function liberarReserva(compraId: string): Promise<ResultadoAccion<{ liberados: number }>> {
  if (!UUID.test(compraId)) return invalido();
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  const { data, error } = await supabase.rpc("fn_liberar_reserva", { p_compra_id: compraId });
  if (error) return fallo(error, "soltar tus asientos");
  const liberados = esFila(data) ? (numeroONull(data.liberados) ?? 0) : 0;
  return { success: true, data: { liberados } };
}

// ─── Pasajeros ───────────────────────────────────────────────────────────────

export interface PasajeroEntrada {
  asiento: string;
  nombre: string;
  cedula: string;
  telefono: string | null;
}

/** Guarda quién viaja en cada asiento apartado (`fn_asignar_pasajeros`). */
export async function asignarPasajeros(entrada: {
  compraId: string;
  pasajeros: PasajeroEntrada[];
}): Promise<ResultadoAccion<ResumenCompra>> {
  const lista = entrada?.pasajeros;
  if (!UUID.test(entrada?.compraId ?? "") || !Array.isArray(lista) || lista.length === 0 || lista.length > MAX_ASIENTOS) {
    return invalido();
  }
  const pasajeros: PasajeroEntrada[] = [];
  for (const p of lista) {
    if (!esFila(p)) return invalido();
    const asiento = texto(p.asiento);
    const nombre = texto(p.nombre).trim().replace(/\s+/g, " ");
    const cedula = texto(p.cedula).trim();
    const telefono = texto(p.telefono).trim();
    if (!ASIENTO.test(asiento) || nombre.length > 120 || cedula.length > 20 || telefono.length > 20) return invalido();
    pasajeros.push({ asiento, nombre, cedula, telefono: telefono || null });
  }
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  const { data, error } = await supabase.rpc("fn_asignar_pasajeros", {
    p_compra_id: entrada.compraId,
    p_pasajeros: pasajeros,
  });
  if (error) return fallo(error, "guardar los datos de los pasajeros");
  return { success: true, data: aResumen(data) };
}

/**
 * Pasajeros de compras anteriores del usuario (los más recientes primero, sin repetir cédula),
 * para rellenar con un toque. Solo lee los boletos propios (RLS).
 */
export async function sugerenciasPasajeros(): Promise<ResultadoAccion<SugerenciaPasajero[]>> {
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  const { data, error } = await supabase
    .from("boletos")
    .select("pasajero_nombre, pasajero_cedula, pasajero_telefono")
    .eq("comprador_id", uid)
    .not("pasajero_nombre", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return fallo(error, "cargar tus pasajeros anteriores");

  const vistas = new Set<string>();
  const lista: SugerenciaPasajero[] = [];
  for (const f of data ?? []) {
    const nombre = texto(f.pasajero_nombre).trim().replace(/\s+/g, " ");
    const cedula = texto(f.pasajero_cedula).trim();
    if (nombre.length < 3 || nombre.length > 120 || !cedulaValida(cedula) || vistas.has(cedula)) continue;
    vistas.add(cedula);
    lista.push({ nombre, cedula, telefono: texto(f.pasajero_telefono).trim() || null });
    if (lista.length >= 6) break;
  }
  return { success: true, data: lista };
}

// ─── Pago ────────────────────────────────────────────────────────────────────

export interface PagoEntrada {
  compraId: string;
  viajeId: string;
  asientos: string[];
  metodoPagoId: string;
  numeroReferencia: string;
  fechaTransaccion: string;
  bancoEmisor: string;
  montoDeclarado: number;
  comprobantePath: string | null;
  /** Tasa con la que el pasajero vio el total: si cambió, el servidor responde `EB_TASA_CAMBIO`. */
  tasaEsperada: number | null;
  /** Estable por intento: reintentar con la misma clave no duplica el pago. */
  claveIdempotencia: string;
}

/** Reporta el pago de la compra (`fn_checkout_boletos`, atómico e idempotente). */
export async function reportarPago(entrada: PagoEntrada): Promise<ResultadoAccion<ResumenCompra>> {
  const asientos = asientosValidos(entrada?.asientos);
  const tasa = entrada?.tasaEsperada === null || entrada?.tasaEsperada === undefined ? null : Number(entrada.tasaEsperada);
  if (
    !UUID.test(entrada?.compraId ?? "") ||
    !UUID.test(entrada?.viajeId ?? "") ||
    !UUID.test(entrada?.metodoPagoId ?? "") ||
    !asientos ||
    (tasa !== null && (!Number.isFinite(tasa) || tasa <= 0)) ||
    !CLAVE.test(texto(entrada?.claveIdempotencia))
  ) {
    return invalido();
  }
  const { supabase, uid } = await haySesion();
  if (!uid) return SIN_SESION;
  // Mismas reglas que el formulario (`validarDatosPago`): referencia, fecha, banco, monto y capture.
  const pago = await normalizarPago(supabase, {
    metodoPagoId: entrada.metodoPagoId,
    numeroReferencia: texto(entrada.numeroReferencia),
    fechaTransaccion: texto(entrada.fechaTransaccion),
    bancoEmisor: texto(entrada.bancoEmisor),
    montoDeclarado: Number(entrada.montoDeclarado),
    comprobantePath: entrada.comprobantePath ? texto(entrada.comprobantePath).trim() : null,
  });
  if ("error" in pago) return invalido(pago.error);
  const { datos } = pago;
  if (datos.comprobantePath && (datos.comprobantePath.length > 200 || !datos.comprobantePath.startsWith(`${uid}/`))) {
    return invalido("No pudimos leer tu comprobante. Adjúntalo de nuevo.");
  }
  const { data, error } = await supabase.rpc("fn_checkout_boletos", {
    p_compra_id: entrada.compraId,
    p_viaje_id: entrada.viajeId,
    p_asientos: asientos,
    p_metodo_pago_id: datos.metodoPagoId,
    p_numero_referencia: datos.numeroReferencia,
    p_fecha_transaccion: datos.fechaTransaccion,
    p_banco_emisor: datos.bancoEmisor,
    p_monto_declarado: datos.montoDeclarado,
    p_tasa_esperada: tasa,
    p_idempotency_key: entrada.claveIdempotencia,
    p_comprobante_path: datos.comprobantePath ?? null,
  });
  if (error) return fallo(error, "reportar tu pago");
  return { success: true, data: aResumen(data) };
}
