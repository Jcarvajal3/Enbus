// ─── Vocabulario único de estados (#22) ──────────────────────────────────────
// Fuente única de etiquetas y tonos para el panel y el admin. Tabla de
// Audits/fase3_spec.md §4: la columna "operador" la ve el personal (panel,
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
  | "reembolso";

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

/** En la app, "Lista para retirar" es un logro del cliente: tono éxito solo para el pasajero. */
const TONO_PASAJERO: Partial<Record<Dominio, Record<string, Tono>>> = {
  encomienda: { EN_OFICINA_DESTINO: "exito" },
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
    tono: "pendiente",
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

const TABLAS: Record<Dominio, Tabla> = {
  boleto: BOLETO,
  encomienda: ENCOMIENDA,
  viaje: VIAJE,
  pago: PAGO,
  cooperativa: COOPERATIVA,
  incidencia: INCIDENCIA,
  ciclo: CICLO,
  reembolso: REEMBOLSO,
};

/** Dominios con estados booleanos: "true"/"false" se traducen a su clave. */
const BOOLEANOS: Partial<Record<Dominio, { si: string; no: string }>> = {
  reembolso: { si: "PROCESADO", no: "PENDIENTE" },
  ciclo: { si: "PAGADO", no: "PENDIENTE" },
};

function clave(dominio: Dominio, estado: string): string {
  const k = estado.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const bool = BOOLEANOS[dominio];
  if (bool && (k === "TRUE" || k === "FALSE")) return k === "TRUE" ? bool.si : bool.no;
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
  const info = TABLAS[dominio][k];
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

// ─── Otros vocabularios (§4) ─────────────────────────────────────────────────

export const ROLES: Record<"user" | "taquillero" | "admin_cooperativa" | "super_admin", string> = {
  user: "Pasajero",
  taquillero: "Taquillero",
  admin_cooperativa: "Administrador de cooperativa",
  super_admin: "Superadministrador",
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

export const METODO_PAGO: Record<"PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE" | "EFECTIVO" | "DIGITAL", string> = {
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "Transferencia",
  ZELLE: "Zelle",
  EFECTIVO: "Efectivo",
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
