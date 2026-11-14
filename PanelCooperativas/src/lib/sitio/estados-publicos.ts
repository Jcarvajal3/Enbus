// ─── Estados de encomienda para el público (etiqueta "pasajero") ─────────────
// Copia de la columna "pasajero" de Audits/fase3_spec.md §4 (la misma que usa
// EnBusApp/src/utils/estados.ts). Si cambia una etiqueta, cambiarla en ambos.

export type TonoEstado = "pendiente" | "info" | "exito" | "peligro" | "terminado" | "neutro";

export interface EstadoPublico {
  etiqueta: string;
  tono: TonoEstado;
  /** Qué significa para quien envía o recibe, en una línea. */
  ayuda: string;
}

const ENCOMIENDA: Record<string, EstadoPublico> = {
  PENDIENTE_DE_ESCANEO: {
    etiqueta: "Por entregar en taquilla",
    tono: "pendiente",
    ayuda: "El envío está creado. Falta llevar el paquete a la taquilla de la cooperativa.",
  },
  EN_RECEPCION: {
    etiqueta: "Recibiéndose en taquilla",
    tono: "pendiente",
    ayuda: "La taquilla está revisando y pesando el paquete.",
  },
  POR_PAGAR: {
    etiqueta: "Pago pendiente",
    tono: "pendiente",
    ayuda: "La taquilla ya calculó el costo. Falta registrar el pago del envío.",
  },
  PAGADA: {
    etiqueta: "Pagada · por salir",
    tono: "info",
    ayuda: "El pago está confirmado. El paquete sale en el próximo viaje de la ruta.",
  },
  EN_TRANSITO: {
    etiqueta: "En camino",
    tono: "info",
    ayuda: "El paquete va en el bus hacia la ciudad de destino.",
  },
  EN_OFICINA_DESTINO: {
    etiqueta: "Lista para retirar",
    tono: "exito",
    ayuda: "Ya está en la oficina de destino. Para retirarla se pide la cédula y el PIN de retiro.",
  },
  ENTREGADA: {
    etiqueta: "Entregada",
    tono: "exito",
    ayuda: "La encomienda fue entregada.",
  },
  CANCELADA: {
    etiqueta: "Cancelada",
    tono: "neutro",
    ayuda: "Este envío fue cancelado.",
  },
  DEVUELTA: {
    etiqueta: "Devuelta al remitente",
    tono: "terminado",
    ayuda: "El paquete volvió a la oficina de origen y se devolvió a quien lo envió.",
  },
};

/** Etapas de la línea de tiempo pública, en orden. */
export const ETAPAS_ENCOMIENDA = [
  { clave: "creado", etiqueta: "Envío creado", estados: ["PENDIENTE_DE_ESCANEO"] },
  { clave: "recibida", etiqueta: "Recibida en taquilla", estados: ["EN_RECEPCION", "POR_PAGAR", "PAGADA"] },
  { clave: "camino", etiqueta: "En camino", estados: ["EN_TRANSITO"] },
  { clave: "lista", etiqueta: "Lista para retirar", estados: ["EN_OFICINA_DESTINO"] },
  { clave: "entregada", etiqueta: "Entregada", estados: ["ENTREGADA"] },
] as const;

/** Estado de encomienda listo para mostrar al público; nunca lanza con un estado desconocido. */
export function estadoEncomienda(estado: string | null | undefined): EstadoPublico {
  if (!estado) return { etiqueta: "Sin estado", tono: "neutro", ayuda: "" };
  return (
    ENCOMIENDA[estado] ?? {
      etiqueta: estado
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
      tono: "neutro",
      ayuda: "",
    }
  );
}

/** Índice de la etapa en la que está un estado (-1 si es un estado fuera de la línea: cancelada, devuelta). */
export function indiceEtapa(estado: string): number {
  return ETAPAS_ENCOMIENDA.findIndex((e) => (e.estados as readonly string[]).includes(estado));
}
