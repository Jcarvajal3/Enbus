"use server";

// Acciones de /enviar. `cotizarRuta` es PÚBLICA (cualquiera puede llamarla con un POST: los
// argumentos son datos sin tipo y hay límite por IP). Las demás exigen sesión de pasajero y
// usan el cliente de sesión, así que las políticas RLS y los triggers de la base mandan.

import { cotizarEnvioWeb, buscarRuta, rutasConEnvio } from "./cotizacion";
import { humanizeError } from "@/lib/errores";
import { obtenerPasajero } from "@/lib/pasajero/sesion";
import { textoEntrada } from "@/lib/sitio/limites";
import { createClient } from "@/lib/supabase/server";
import { leerMonto } from "@/lib/dinero";
import { cedulaParaGuardar, telefonoParaGuardar } from "@/lib/ve";
import { normalizarCiudad } from "@/lib/ve.generated";
import type {
  Cotizacion,
  EntradaRegistro,
  ResultadoRegistro,
  ResultadoSucursales,
  Sucursal,
} from "@/components/pasajero/encomienda/tipos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOTO_RE = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/** Cotiza origen → destino (público). `peso` vacío = 1 kg de referencia. */
export async function cotizarRuta(origen: unknown, destino: unknown, peso: unknown): Promise<Cotizacion> {
  const escrito = textoEntrada(peso, 12);
  let pesoKg: number | null = null;
  if (escrito) {
    pesoKg = leerMonto(escrito);
    if (pesoKg === null) {
      return { tipo: "invalido", campo: "peso", mensaje: "Escribe el peso en kilos, por ejemplo 2,5." };
    }
  }
  return cotizarEnvioWeb(textoEntrada(origen, 60), textoEntrada(destino, 60), pesoKg);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Sucursales de la cooperativa en la ciudad de origen (dónde entregar el paquete). */
export async function cargarSucursales(cooperativaId: unknown, ciudad: unknown): Promise<ResultadoSucursales> {
  const pasajero = await obtenerPasajero();
  if (!pasajero?.esPasajero) return { ok: false, error: "Tu sesión venció. Vuelve a ingresar para continuar." };
  const coop = textoEntrada(cooperativaId, 40);
  const ciudadClave = normalizarCiudad(textoEntrada(ciudad, 60));
  if (!UUID_RE.test(coop) || !ciudadClave) return { ok: false, error: "No reconocimos la cooperativa elegida." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_sucursales_en_ciudad", { p_cooperativa_id: coop, p_ciudad: ciudadClave });
    if (error) return { ok: false, error: humanizeError(error, "ver las taquillas") };
    const filas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const sucursales: Sucursal[] = filas
      .map((f) => ({
        id: String(f.id ?? ""),
        nombre: texto(f.nombre) ?? "Taquilla",
        direccion: texto(f.direccion),
        telefono: texto(f.telefono),
        horario: texto(f.horario),
      }))
      .filter((s) => s.id);
    return { ok: true, sucursales };
  } catch (err) {
    console.error("No se pudieron leer las sucursales:", err);
    return { ok: false, error: "No pudimos ver las taquillas. Revisa tu conexión e intenta de nuevo." };
  }
}

function recortar(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Registra la encomienda como lo hace la app: INSERT con el cliente de sesión, estado
 * PENDIENTE_DE_ESCANEO. El costo lo fija la taquilla al pesar. Con `idempotency_key` un
 * reintento (respuesta perdida, doble clic) devuelve el envío ya creado en vez de duplicarlo.
 */
export async function registrarEncomienda(entrada: EntradaRegistro): Promise<ResultadoRegistro> {
  const pasajero = await obtenerPasajero();
  if (!pasajero?.esPasajero) {
    return { ok: false, error: "Tu sesión venció. Vuelve a ingresar para continuar.", campo: "sesion" };
  }
  if (!pasajero.perfilCompleto) {
    return { ok: false, error: "Completa tu cédula y teléfono para registrar el envío.", campo: "perfil" };
  }

  const e = (entrada ?? {}) as Partial<Record<keyof EntradaRegistro, unknown>>;
  const cooperativaId = textoEntrada(e.cooperativaId, 40);
  const clave = textoEntrada(e.idempotencyKey, 80);
  if (!UUID_RE.test(cooperativaId) || clave.length < 8) {
    return { ok: false, error: "Los datos del envío no son válidos. Vuelve al inicio e intenta de nuevo." };
  }
  // Estados y ciudades salen del catálogo de rutas del servidor, no de lo que mande el cliente.
  const ruta = buscarRuta(await rutasConEnvio(), textoEntrada(e.origen, 60), textoEntrada(e.destino, 60));
  if (!ruta) return { ok: false, error: "Esa ruta ya no está disponible. Elige otra." };

  const nombre = recortar(e.receptorNombre, 120);
  const cedula = cedulaParaGuardar(textoEntrada(e.receptorCedula, 30));
  const telefono = telefonoParaGuardar(textoEntrada(e.receptorTelefono, 30));
  if (nombre.length < 3 || !cedula || !telefono) {
    return { ok: false, error: "Revisa el nombre, la cédula y el teléfono de quien recibe.", campo: "destinatario" };
  }
  const descripcion = recortar(e.descripcion, 500);
  if (descripcion.length < 3) {
    return { ok: false, error: "Describe el contenido del paquete.", campo: "descripcion" };
  }
  const modalidad = e.modalidad === "DESTINO" ? "DESTINO" : e.modalidad === "ORIGEN" ? "ORIGEN" : null;
  if (!modalidad) return { ok: false, error: "Elige quién paga el envío." };

  const peso = typeof e.pesoKg === "number" && Number.isFinite(e.pesoKg) && e.pesoKg > 0 && e.pesoKg < 10000 ? e.pesoKg : null;
  const valor = typeof e.valorUsd === "number" && Number.isFinite(e.valorUsd) && e.valorUsd > 0 && e.valorUsd < 1e7 ? e.valorUsd : null;
  // La foto debe estar en la carpeta de quien envía (la base también lo comprueba).
  const foto = typeof e.fotoPath === "string" ? e.fotoPath : null;
  const fotoValida = foto && FOTO_RE.exec(foto)?.[1].toLowerCase() === pasajero.id.toLowerCase() ? foto : null;

  const fila: Record<string, unknown> = {
    sender_id: pasajero.id,
    receiver_nombre: nombre,
    receiver_cedula_rif: cedula,
    receiver_telefono: telefono,
    estado_origen: ruta.origen.estado,
    ciudad_origen: ruta.origen.ciudad,
    estado_destino: ruta.destino.estado,
    ciudad_destino: ruta.destino.ciudad,
    descripcion_contenido: descripcion,
    peso_kg: peso,
    estado: "PENDIENTE_DE_ESCANEO",
    modalidad_pago: modalidad,
    cooperativa_id: cooperativaId,
    idempotency_key: clave,
  };
  if (fotoValida) fila.foto_cliente_path = fotoValida;
  if (valor !== null) fila.valor_declarado = valor;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("encomiendas").insert(fila).select("id, tracking_id").single();
    if (!error && data) return { ok: true, id: String(data.id), trackingId: texto(data.tracking_id) };

    // Ya existe un envío con esta clave: el intento anterior sí se guardó.
    const repetido =
      error?.code === "23505" && `${error.message ?? ""} ${error.details ?? ""}`.includes("idempotencia");
    if (!repetido) {
      return { ok: false, error: humanizeError(error, "registrar tu envío") };
    }
    const { data: previa, error: errPrevia } = await supabase
      .from("encomiendas")
      .select("id, tracking_id")
      .eq("sender_id", pasajero.id)
      .eq("idempotency_key", clave)
      .maybeSingle();
    if (errPrevia || !previa) return { ok: false, error: humanizeError(errPrevia ?? error, "registrar tu envío") };
    return { ok: true, id: String(previa.id), trackingId: texto(previa.tracking_id) };
  } catch (err) {
    console.error("No se pudo registrar la encomienda:", err);
    return { ok: false, error: "No pudimos registrar tu envío. Revisa tu conexión e intenta de nuevo." };
  }
}
