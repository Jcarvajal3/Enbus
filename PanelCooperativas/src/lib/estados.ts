// ─── Vocabulario único de estados (#22) ──────────────────────────────────────
// Fuente única de etiquetas y tonos para el panel y el admin. Tabla de
// Audits/fase5/sistema.md §4.2 (con las correcciones de fase5_spec §2.4) y
// Specs/00_General/Glosario.md §3: la columna "operador" la ve el personal (panel,
// admin); la columna "pasajero" es la que ven la app y la landing (se incluye
// para mostrar "lo que ve el cliente" cuando haga falta).
//
// Reglas:
//   - Ningún componente arma su propio mapa de estados: usa `estadoInfo`,
//     `etiquetaEstado` o `<StatusBadge dominio=… />`.
//   - Un estado desconocido se muestra como literal legible ("En espera") con
//     tono neutro: nunca un enum crudo ni una etiqueta inventada.
//   - Las claves son string (no los tipos de cada tabla) para no acoplar este
//     archivo a lib/types/*.

import { fechaVE } from "@/lib/fechas";

export type Dominio =
  | "boleto"
  | "encomienda"
  | "viaje"
  | "pago"
  | "cooperativa"
  | "incidencia"
  | "ciclo"
  | "reembolso"
  /** Cuenta de usuario o empleado: Activa / Suspendida / Cuenta eliminada. */
  | "cuenta"
  /** Ruta, sucursal o método de pago: Activa / Inactiva (también "true"/"false"). */
  | "recurso"
  /** Tarifa de encomiendas: Vigente / Programada / Anterior. */
  | "tarifa"
  /** Prioridad de una incidencia: Alta / Media / Baja (claves alta|media|baja). */
  | "prioridad"
  /** Reputación de una cooperativa: clave con `claveReputacion(promedio, total)`. */
  | "reputacion"
  /** Días en la oficina de destino antes de devolverse: `retencionInfo(dias)`. */
  | "retencion"
  /** Cobro de una encomienda (`getCobroEncomienda` de la app): COSTO_PENDIENTE, SIN_PAGO… */
  | "cobro";

export type Tono = "neutro" | "pendiente" | "exito" | "info" | "terminado" | "peligro";

export type EstadoInfo = {
  /** Lo que ve el pasajero o cliente (app, landing). */
  pasajero: string;
  /** Lo que ve el personal (panel, admin). */
  operador: string;
  tono: Tono;
  /** Una línea que explica qué significa el estado para el operador. */
  ayuda?: string;
};

type Tabla = Record<string, EstadoInfo>;

// ── Encomienda ──
const ENCOMIENDA: Tabla = {
  PENDIENTE_DE_ESCANEO: {
    pasajero: "Por entregar en taquilla",
    operador: "Por recibir",
    tono: "pendiente",
    ayuda: "El cliente la registró en la app y todavía no la trae a la taquilla.",
  },
  EN_RECEPCION: {
    pasajero: "Recibiéndose en taquilla",
    operador: "En recepción",
    tono: "pendiente",
    ayuda: "La taquilla la está recibiendo y pesando.",
  },
  POR_PAGAR: {
    pasajero: "Pago pendiente",
    operador: "Por cobrar",
    tono: "pendiente",
    ayuda: "Ya tiene costo. Falta el pago para despacharla.",
  },
  PAGADA: {
    pasajero: "Pagada · por salir",
    operador: "Lista para despacho",
    tono: "info",
    ayuda: "Pagada. Súbela al próximo bus hacia su destino.",
  },
  EN_TRANSITO: {
    pasajero: "En camino",
    operador: "En tránsito",
    tono: "info",
    ayuda: "Va en el bus hacia la oficina de destino.",
  },
  EN_OFICINA_DESTINO: {
    pasajero: "Lista para retirar",
    operador: "En oficina de destino",
    tono: "info",
    ayuda: "Llegó a la oficina de destino y espera a quien la retira.",
  },
  ENTREGADA: {
    pasajero: "Entregada",
    operador: "Entregada",
    tono: "exito",
    ayuda: "Se entregó a quien la retiró.",
  },
  CANCELADA: {
    pasajero: "Cancelada",
    operador: "Cancelada",
    tono: "neutro",
    ayuda: "El envío se canceló.",
  },
  DEVUELTA: {
    pasajero: "Devuelta al remitente",
    operador: "Devuelta al remitente",
    tono: "terminado",
    ayuda: "Nadie la retiró a tiempo y volvió a quien la envió.",
  },
};

/**
 * Tono distinto para el pasajero: "Lista para retirar" es un logro del cliente (éxito)
 * y su reporte "Recibido" no es un error suyo (info; para el operador sigue en peligro).
 */
const TONO_PASAJERO: Partial<Record<Dominio, Record<string, Tono>>> = {
  encomienda: { EN_OFICINA_DESTINO: "exito" },
  incidencia: { ABIERTA: "info" },
};

// ── Boleto (estado real y subestados visibles de RESERVADO) ──
const BOLETO: Tabla = {
  RESERVA_SIN_PAGAR: {
    pasajero: "Sin pagar",
    operador: "Reserva sin pagar",
    tono: "pendiente",
    ayuda: "Asiento apartado sin pago. Se libera si vence la reserva.",
  },
  PAGO_EN_VERIFICACION: {
    pasajero: "Pago en verificación",
    operador: "Pago por verificar",
    tono: "pendiente",
    ayuda: "El pasajero registró un pago. Revísalo en Pagos por verificar.",
  },
  PAGO_RECHAZADO: {
    pasajero: "Pago rechazado",
    operador: "Pago rechazado",
    tono: "peligro",
    ayuda: "El pago no se confirmó. El pasajero puede registrarlo de nuevo.",
  },
  RESERVADO: {
    pasajero: "Apartado",
    operador: "Apartado",
    tono: "pendiente",
    ayuda: "Asiento apartado.",
  },
  PAGADO: {
    pasajero: "Confirmado",
    operador: "Pagado",
    tono: "exito",
    ayuda: "Pagado. El pase de abordaje es válido.",
  },
  USADO: {
    pasajero: "Viaje realizado",
    operador: "Embarcado",
    tono: "terminado",
    ayuda: "El pasajero ya subió al bus con este boleto.",
  },
  CANCELADO: {
    pasajero: "Cancelado",
    operador: "Cancelado",
    tono: "neutro",
    ayuda: "El boleto se canceló y el asiento quedó libre.",
  },
  EXPIRADO: {
    pasajero: "Vencido",
    operador: "Vencido",
    tono: "terminado",
    ayuda: "La reserva venció sin pago y el asiento se liberó.",
  },
};

// ── Reembolso (claves PENDIENTE / PROCESADO; también acepta "false"/"true") ──
const REEMBOLSO: Tabla = {
  PENDIENTE: {
    pasajero: "Reembolso pendiente",
    operador: "Por devolver",
    tono: "pendiente",
    ayuda: "Devuelve el dinero por el mismo medio con que pagó el pasajero y regístralo.",
  },
  PROCESADO: {
    pasajero: "Reembolsado",
    operador: "Devuelto",
    tono: "exito",
    ayuda: "La devolución ya se registró y se avisó al pasajero.",
  },
};

// ── Viaje ──
const VIAJE: Tabla = {
  PROGRAMADO: { pasajero: "Programado", operador: "Programado", tono: "info", ayuda: "Todavía no sale." },
  EN_CURSO: { pasajero: "En ruta", operador: "En ruta", tono: "info", ayuda: "El bus ya salió." },
  COMPLETADO: { pasajero: "Completado", operador: "Completado", tono: "terminado", ayuda: "El viaje terminó." },
  CANCELADO: {
    pasajero: "Cancelado",
    operador: "Cancelado",
    tono: "neutro",
    ayuda: "El viaje se canceló y se avisó a los pasajeros.",
  },
};

// ── Pago (estado_verificacion) ──
const PAGO: Tabla = {
  PENDIENTE: {
    pasajero: "En verificación",
    operador: "Por verificar",
    tono: "pendiente",
    ayuda: "Revisa que el dinero llegó a la cuenta y apruébalo o recházalo.",
  },
  APROBADO: { pasajero: "Confirmado", operador: "Aprobado", tono: "exito", ayuda: "El pago se confirmó." },
  RECHAZADO: {
    pasajero: "Rechazado",
    operador: "Rechazado",
    tono: "peligro",
    ayuda: "El pago no se confirmó y se avisó al cliente con el motivo.",
  },
};

// ── Cooperativa (el pasajero no ve estos estados: se repite la etiqueta del operador) ──
const COOPERATIVA: Tabla = {
  PENDIENTE: {
    pasajero: "En revisión",
    operador: "En revisión",
    tono: "pendiente",
    ayuda: "EnBus está revisando la solicitud (24 a 48 horas hábiles).",
  },
  RECHAZADA: {
    pasajero: "Rechazada",
    operador: "Rechazada",
    tono: "peligro",
    ayuda: "La solicitud se rechazó con un motivo. Puede corregir sus datos y pedir una nueva revisión.",
  },
  ACTIVA: { pasajero: "Activa", operador: "Activa", tono: "exito", ayuda: "Puede vender boletos y recibir encomiendas." },
  SUSPENDIDA: {
    pasajero: "Suspendida",
    operador: "Suspendida",
    tono: "peligro",
    ayuda: "No puede vender en la app hasta que se reactive.",
  },
  DESACTIVADA: {
    pasajero: "Desactivada",
    operador: "Desactivada",
    tono: "neutro",
    ayuda: "Ya no opera en EnBus.",
  },
};

// ── Incidencia ──
const INCIDENCIA: Tabla = {
  ABIERTA: { pasajero: "Recibido", operador: "Abierta", tono: "peligro", ayuda: "Nadie la ha tomado todavía." },
  EN_PROCESO: { pasajero: "En revisión", operador: "En proceso", tono: "pendiente", ayuda: "Alguien la está atendiendo." },
  RESUELTA: { pasajero: "Resuelto", operador: "Resuelta", tono: "exito", ayuda: "Se resolvió y se registró la resolución." },
};

// ── Ciclo de comisiones (claves PENDIENTE / PAGADO; también "false"/"true") ──
const CICLO: Tabla = {
  PENDIENTE: {
    pasajero: "Pendiente",
    operador: "Pendiente",
    tono: "pendiente",
    ayuda: "La cooperativa todavía no paga la comisión de este período.",
  },
  PAGADO: {
    pasajero: "Pagado",
    operador: "Pagado",
    tono: "exito",
    ayuda: "La comisión de este período ya se registró como pagada.",
  },
};

// ── Cuenta (usuarios del admin y empleados; el verbo sigue la etiqueta:
//    "Suspender cuenta" / "Reactivar cuenta") ──
const CUENTA: Tabla = {
  ACTIVA: { pasajero: "Activa", operador: "Activa", tono: "exito", ayuda: "Puede iniciar sesión." },
  SUSPENDIDA: {
    pasajero: "Suspendida",
    operador: "Suspendida",
    tono: "peligro",
    ayuda: "No puede iniciar sesión hasta que se reactive.",
  },
  ELIMINADA: {
    pasajero: "Cuenta eliminada",
    operador: "Cuenta eliminada",
    tono: "terminado",
    ayuda: "La persona eliminó su cuenta.",
  },
};

// ── Recurso (ruta, sucursal, método de pago) ──
const RECURSO: Tabla = {
  ACTIVO: { pasajero: "Activa", operador: "Activa", tono: "exito", ayuda: "Se usa en ventas y envíos." },
  INACTIVO: { pasajero: "Inactiva", operador: "Inactiva", tono: "neutro", ayuda: "No aparece en ventas ni envíos." },
};

// ── Tarifa de encomiendas ──
const TARIFA: Tabla = {
  VIGENTE: { pasajero: "Vigente", operador: "Vigente", tono: "exito", ayuda: "Es la que se cobra hoy." },
  PROGRAMADA: { pasajero: "Programada", operador: "Programada", tono: "info", ayuda: "Empieza a regir en la fecha indicada." },
  ANTERIOR: { pasajero: "Anterior", operador: "Anterior", tono: "neutro", ayuda: "Ya no se cobra." },
};

// ── Prioridad de incidencia ──
const PRIORIDAD: Tabla = {
  ALTA: { pasajero: "Alta", operador: "Alta", tono: "peligro", ayuda: "Pérdida o daño de una encomienda." },
  MEDIA: { pasajero: "Media", operador: "Media", tono: "pendiente", ayuda: "Reporte de un pago o más de 72 h en tránsito." },
  BAJA: { pasajero: "Baja", operador: "Baja", tono: "neutro" },
};

// ── Reputación de una cooperativa (umbrales de `claveReputacion`) ──
const REPUTACION: Tabla = {
  EXCELENTE: { pasajero: "Reputación excelente", operador: "Reputación excelente", tono: "exito", ayuda: "Promedio de 4 o más." },
  REGULAR: { pasajero: "Reputación regular", operador: "Reputación regular", tono: "pendiente", ayuda: "Promedio de 3 a 3,9." },
  REVISION: { pasajero: "Requiere revisión", operador: "Requiere revisión", tono: "peligro", ayuda: "Promedio por debajo de 3." },
  SIN_CALIFICACIONES: { pasajero: "Todavía no la califican", operador: "Todavía no la califican", tono: "neutro" },
};

// ── Retención en la oficina de destino (la etiqueta visible son los días: `retencionInfo`) ──
const RETENCION: Tabla = {
  EN_PLAZO: { pasajero: "En plazo", operador: "En plazo", tono: "neutro", ayuda: "Todavía tiene días para retirarse." },
  POR_VENCER: { pasajero: "Por vencer", operador: "Por vencer", tono: "pendiente", ayuda: "Quedan pocos días para retirarla." },
  ULTIMO_DIA: {
    pasajero: "Último día",
    operador: "Último día",
    tono: "peligro",
    ayuda: "Si no se retira, se devuelve al remitente.",
  },
};

// ── Cobro de una encomienda ──
const COBRO: Tabla = {
  COSTO_PENDIENTE: {
    pasajero: "Costo por calcular",
    operador: "Por calcular",
    tono: "neutro",
    ayuda: "La taquilla calcula el costo al pesar el paquete.",
  },
  SIN_PAGO: { pasajero: "Sin pagar", operador: "Por cobrar", tono: "pendiente", ayuda: "Tiene costo y no tiene pago registrado." },
  EN_VERIFICACION: {
    pasajero: "Pago en verificación",
    operador: "Por verificar",
    tono: "pendiente",
    ayuda: "Hay un pago esperando la verificación de la cooperativa.",
  },
  RECHAZADO: { pasajero: "Pago rechazado", operador: "Rechazado", tono: "peligro", ayuda: "El pago no se confirmó." },
  PAGADO: { pasajero: "Pago confirmado", operador: "Pagado", tono: "exito", ayuda: "El cobro está hecho." },
  NO_APLICA: { pasajero: "Sin cobro", operador: "Sin cobro", tono: "neutro" },
};

const TABLAS: Record<Dominio, Tabla> = {
  boleto: BOLETO,
  encomienda: ENCOMIENDA,
  viaje: VIAJE,
  pago: PAGO,
  cooperativa: COOPERATIVA,
  incidencia: INCIDENCIA,
  ciclo: CICLO,
  reembolso: REEMBOLSO,
  cuenta: CUENTA,
  recurso: RECURSO,
  tarifa: TARIFA,
  prioridad: PRIORIDAD,
  reputacion: REPUTACION,
  retencion: RETENCION,
  cobro: COBRO,
};

/** Dominios con estados booleanos: "true"/"false" se traducen a su clave. */
const BOOLEANOS: Partial<Record<Dominio, { si: string; no: string }>> = {
  reembolso: { si: "PROCESADO", no: "PENDIENTE" },
  ciclo: { si: "PAGADO", no: "PENDIENTE" },
  cuenta: { si: "ACTIVA", no: "SUSPENDIDA" },
  recurso: { si: "ACTIVO", no: "INACTIVO" },
};

/** Sinónimos que llegan de la base o de código anterior → clave de la tabla. */
const SINONIMOS: Partial<Record<Dominio, Record<string, string>>> = {
  cuenta: {
    ACTIVO: "ACTIVA",
    SUSPENDIDO: "SUSPENDIDA",
    BLOQUEADA: "SUSPENDIDA",
    BLOQUEADO: "SUSPENDIDA",
    DESACTIVADA: "SUSPENDIDA",
    DESACTIVADO: "SUSPENDIDA",
    ELIMINADO: "ELIMINADA",
  },
  recurso: { ACTIVA: "ACTIVO", INACTIVA: "INACTIVO" },
  tarifa: { HISTORICA: "ANTERIOR", HISTORICO: "ANTERIOR" },
};

function clave(dominio: Dominio, estado: string): string {
  const k = estado.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const bool = BOOLEANOS[dominio];
  if (bool && (k === "TRUE" || k === "FALSE")) return k === "TRUE" ? bool.si : bool.no;
  const sinonimos = SINONIMOS[dominio];
  if (sinonimos && Object.prototype.hasOwnProperty.call(sinonimos, k)) return sinonimos[k];
  return k;
}

/** "EN_ESPERA_X" → "En espera x": legible, sin inventar significado. */
function literalLegible(estado: string): string {
  const texto = estado.replace(/[_-]+/g, " ").trim().toLowerCase();
  return texto ? texto.replace(/^\p{L}/u, (c) => c.toUpperCase()) : "Sin estado";
}

/** Etiquetas y tono de un estado. Desconocido → literal legible y tono neutro. */
export function estadoInfo(dominio: Dominio, estado: string | null | undefined): EstadoInfo {
  if (estado === null || estado === undefined || String(estado).trim() === "") {
    return { pasajero: "Sin estado", operador: "Sin estado", tono: "neutro" };
  }
  const k = clave(dominio, String(estado));
  const tabla = TABLAS[dominio];
  const info = Object.prototype.hasOwnProperty.call(tabla, k) ? tabla[k] : undefined;
  if (info) return info;
  const texto = literalLegible(String(estado));
  return { pasajero: texto, operador: texto, tono: "neutro" };
}

/** Tono según la audiencia (en la app, "Lista para retirar" es éxito). */
export function tonoEstado(
  dominio: Dominio,
  estado: string | null | undefined,
  audiencia: "operador" | "pasajero" = "operador"
): Tono {
  const info = estadoInfo(dominio, estado);
  if (audiencia === "pasajero" && estado) {
    const especial = TONO_PASAJERO[dominio]?.[clave(dominio, String(estado))];
    if (especial) return especial;
  }
  return info.tono;
}

/** Texto del estado para la audiencia indicada (por defecto, el operador). */
export function etiquetaEstado(
  dominio: Dominio,
  estado: string | null | undefined,
  audiencia: "operador" | "pasajero" = "operador"
): string {
  const info = estadoInfo(dominio, estado);
  return audiencia === "pasajero" ? info.pasajero : info.operador;
}

/** Orden en que se busca un estado cuando el componente no indica el dominio. */
const ORDEN_SIN_DOMINIO: Dominio[] = ["encomienda", "boleto", "pago", "viaje", "incidencia", "cooperativa"];

/**
 * Dominio probable de un estado cuando no se indica (compatibilidad con los
 * `<StatusBadge status=…>` sin `dominio`). Ambiguos: PENDIENTE → pago,
 * CANCELADO → boleto (misma etiqueta que viaje).
 */
export function dominioDeEstado(estado: string | null | undefined): Dominio | null {
  if (estado === null || estado === undefined || String(estado).trim() === "") return null;
  // Misma normalización que estadoInfo ("Por pagar" → POR_PAGAR); solo claves propias.
  return (
    ORDEN_SIN_DOMINIO.find((d) =>
      Object.prototype.hasOwnProperty.call(TABLAS[d], clave(d, String(estado)))
    ) ?? null
  );
}

/** Todas las claves conocidas de un dominio (para filtros y pruebas). */
export function estadosDe(dominio: Dominio): string[] {
  return Object.keys(TABLAS[dominio]);
}

/** Ciclo de comisiones: "Pendiente" o "Pagado el 05/10". */
export function etiquetaCiclo(pagado: boolean, pagadoAt?: string | null): string {
  if (!pagado) return CICLO.PENDIENTE.operador;
  if (!pagadoAt) return CICLO.PAGADO.operador;
  // Columna DATE ('YYYY-MM-DD') sin convertir de zona; instante ISO → día en Venezuela.
  let iso: string;
  try {
    iso = /^\d{4}-\d{2}-\d{2}$/.test(pagadoAt) ? pagadoAt : fechaVE(pagadoAt);
  } catch {
    return CICLO.PAGADO.operador; // fecha inválida: se muestra "Pagado", nunca rompe la tabla
  }
  const [, mes, dia] = iso.split("-");
  return dia && mes ? `Pagado el ${dia}/${mes}` : CICLO.PAGADO.operador;
}

/**
 * Clave de `reputacion` según el promedio de calificaciones (umbrales de la ficha de
 * cooperativa): sin calificaciones → SIN_CALIFICACIONES; ≥ 4 → EXCELENTE; ≥ 3 → REGULAR;
 * si no, REVISION.
 */
export function claveReputacion(promedio: number | null | undefined, total: number | null | undefined): string {
  if (!total || total <= 0 || typeof promedio !== "number" || !Number.isFinite(promedio)) return "SIN_CALIFICACIONES";
  if (promedio >= 4) return "EXCELENTE";
  if (promedio >= 3) return "REGULAR";
  return "REVISION";
}

/**
 * Retención en la oficina de destino: clave, etiqueta visible ("3 días hábiles") y tono.
 * `limite` = días hábiles hasta la devolución (DIAS_HABILES_DEVOLUCION, hoy 5):
 * desde `limite - 1` → peligro; desde `limite - 2` → pendiente; antes, neutro.
 */
export function retencionInfo(dias: number, limite = 5): { clave: string; etiqueta: string; tono: Tono } {
  const n = Number.isFinite(dias) ? Math.max(0, Math.floor(dias)) : 0;
  const k = n >= limite - 1 ? "ULTIMO_DIA" : n >= limite - 2 ? "POR_VENCER" : "EN_PLAZO";
  return { clave: k, etiqueta: `${n} ${n === 1 ? "día hábil" : "días hábiles"}`, tono: RETENCION[k].tono };
}

// ─── Otros vocabularios (§4) ─────────────────────────────────────────────────

export const ROLES: Record<"user" | "taquillero" | "admin_cooperativa" | "super_admin", string> = {
  user: "Pasajero",
  taquillero: "Taquillero",
  admin_cooperativa: "Administrador de cooperativa",
  super_admin: "Administrador EnBus",
};

/** Nombre legible de un rol; desconocido → literal legible. */
export function etiquetaRol(rol: string | null | undefined): string {
  if (!rol) return "Sin rol";
  return (ROLES as Record<string, string>)[rol] ?? literalLegible(rol);
}

export const MODALIDAD_PAGO: Record<"ORIGEN" | "DESTINO", { corto: string; largo: string }> = {
  ORIGEN: { corto: "Paga al enviar", largo: "Paga quien envía, al entregar el paquete" },
  DESTINO: { corto: "Paga al retirar", largo: "Paga quien recibe, al retirarlo" },
};

export const METODO_PAGO: Record<
  "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE" | "EFECTIVO" | "PUNTO_DE_VENTA" | "DIGITAL",
  string
> = {
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "Transferencia",
  ZELLE: "Zelle",
  EFECTIVO: "Efectivo",
  PUNTO_DE_VENTA: "Punto de venta",
  DIGITAL: "Pago digital",
};

/** Nombre legible de un método de pago; desconocido → literal legible. */
export function etiquetaMetodoPago(metodo: string | null | undefined): string {
  if (!metodo) return "Sin método";
  return (METODO_PAGO as Record<string, string>)[metodo] ?? literalLegible(metodo);
}

export const CATEGORIA_REPORTE: Record<"PAGO" | "BOLETO" | "ENCOMIENDA" | "CUENTA" | "OTRO", string> = {
  PAGO: "Pago",
  BOLETO: "Boleto",
  ENCOMIENDA: "Encomienda",
  CUENTA: "Cuenta",
  OTRO: "Otro",
};

/** Tipos de incidencia (columna `incidencias.tipo`). */
export const TIPO_INCIDENCIA: Record<string, string> = {
  PERDIDA: "Pérdida de encomienda",
  DANADA: "Encomienda dañada",
  DEMORA: "Demora en el envío",
  ALERTA_AMARILLA: "Más de 72 h en tránsito",
  REPORTE_USUARIO: "Reporte de usuario",
};

export function etiquetaTipoIncidencia(tipo: string | null | undefined): string {
  if (!tipo) return "Sin tipo";
  return TIPO_INCIDENCIA[tipo] ?? literalLegible(tipo);
}
