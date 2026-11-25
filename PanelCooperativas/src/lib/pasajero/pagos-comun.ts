// ─── Tipos y validación del pago del pasajero (servidor y cliente) ───────────
// `pagos.ts` (server-only) los re-exporta. Las reglas son las de `_validar_comprobante` y
// `_validar_capture` de la base: el servidor vuelve a validar, esto solo da el aviso a tiempo.

import { hoyVE, sumarDiasVE } from "@/lib/fechas";
import { leerMonto } from "@/lib/dinero";

/** Formas de pago en línea: el efectivo y el punto de venta solo existen en taquilla. */
export type TipoMetodoPagoPasajero = "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

export const TIPOS_METODO_PASAJERO: readonly TipoMetodoPagoPasajero[] = [
  "PAGO_MOVIL",
  "TRANSFERENCIA_BANCARIA",
  "ZELLE",
];

/** Cuenta de la cooperativa donde el pasajero paga (fila de `metodos_pago_cooperativa`). */
export interface MetodoPagoPasajero {
  id: string;
  tipo: TipoMetodoPagoPasajero;
  banco: string | null;
  titular: string;
  /** Cuenta bancaria, o teléfono en Pago Móvil. */
  numeroCuenta: string | null;
  cedulaRif: string | null;
  emailZelle: string | null;
  instrucciones: string | null;
}

/** Lo que el pasajero declara al reportar un pago (parámetros `p_*` de `fn_checkout_boletos` / `fn_registrar_pago_encomienda`). */
export interface DatosPagoPasajero {
  metodoPagoId: string;
  /** Sin espacios ni separadores; Zelle en mayúsculas. */
  numeroReferencia: string;
  /** 'YYYY-MM-DD' (día en Venezuela). */
  fechaTransaccion: string;
  /** "0134 · Banesco", o "Zelle". */
  bancoEmisor: string;
  /** En Bs (Pago Móvil, Transferencia) o USD (Zelle). */
  montoDeclarado: number;
  /** Ruta en el bucket `comprobantes-pago`; obligatoria en Pago Móvil. */
  comprobantePath?: string | null;
}

export type CampoPago = "referencia" | "fecha" | "banco" | "monto" | "comprobante";
export type ErroresPago = Partial<Record<CampoPago, string>>;

/** Lo que escribe el pasajero, antes de normalizar (el monto como número ya leído, o null). */
export type BorradorPago = {
  metodoPagoId: string;
  numeroReferencia: string;
  fechaTransaccion: string;
  bancoEmisor: string;
  montoDeclarado: number | null;
  comprobantePath?: string | null;
};

export type ResultadoValidacionPago =
  | { ok: true; datos: DatosPagoPasajero }
  | { ok: false; errores: ErroresPago };

/** Sin espacios ni separadores, en mayúsculas (como `_validar_comprobante`). */
export function normalizarReferencia(texto: string): string {
  return texto.replace(/[\s._/-]/g, "").toUpperCase();
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Días hacia atrás que admite el servidor para la fecha del pago. */
export const DIAS_ATRAS_PAGO = 30;

/**
 * Valida y normaliza lo que declara el pasajero. `esperado` (en la moneda del método: Bs, o USD
 * en Zelle) activa el tope del servidor (monto ≤ 10 veces lo esperado).
 */
export function validarDatosPago(
  datos: BorradorPago,
  metodo: Pick<MetodoPagoPasajero, "id" | "tipo">,
  esperado?: number | null
): ResultadoValidacionPago {
  const errores: ErroresPago = {};
  const zelle = metodo.tipo === "ZELLE";
  const referencia = normalizarReferencia(datos.numeroReferencia);

  if (zelle) {
    if (!/^[A-Z0-9]{4,40}$/.test(referencia)) {
      errores.referencia = "Escribe el código de confirmación de Zelle completo (mínimo 4 caracteres).";
    }
  } else if (!/^[0-9]{4,30}$/.test(referencia)) {
    errores.referencia = "Escribe el número de referencia completo: solo números, mínimo 4.";
  }

  const hoy = hoyVE();
  const fecha = datos.fechaTransaccion;
  if (!FECHA_RE.test(fecha)) errores.fecha = "Elige la fecha en que hiciste el pago.";
  else if (fecha > hoy || fecha < sumarDiasVE(hoy, -DIAS_ATRAS_PAGO)) {
    errores.fecha = `La fecha del pago debe estar entre hoy y los últimos ${DIAS_ATRAS_PAGO} días.`;
  }

  const banco = zelle ? "Zelle" : datos.bancoEmisor.trim();
  if (!banco) errores.banco = "Elige el banco desde el que pagaste.";

  const monto = datos.montoDeclarado;
  if (monto === null || !Number.isFinite(monto) || monto <= 0) {
    errores.monto = zelle
      ? "Escribe el monto que enviaste, por ejemplo 12,40."
      : "Escribe el monto que pagaste, por ejemplo 1.250,00.";
  } else if (esperado && esperado > 0 && monto > esperado * 10) {
    errores.monto = "Revisa el monto que pagaste: es mucho mayor al total.";
  }

  const comprobante = datos.comprobantePath?.trim() || null;
  if (metodo.tipo === "PAGO_MOVIL" && !comprobante) {
    errores.comprobante = "Adjunta el capture del Pago Móvil.";
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      metodoPagoId: metodo.id,
      numeroReferencia: referencia,
      fechaTransaccion: fecha,
      bancoEmisor: banco,
      montoDeclarado: monto as number,
      comprobantePath: metodo.tipo === "PAGO_MOVIL" ? comprobante : null,
    },
  };
}

/** Lee un monto escrito con la máscara venezolana ("1.250,50") → número o null. */
export function montoDeTexto(texto: string): number | null {
  return leerMonto(texto);
}
