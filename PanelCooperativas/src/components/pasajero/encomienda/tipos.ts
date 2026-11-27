// ─── Tipos del flujo "Enviar encomienda" (web del pasajero) ──────────────────
// Compartidos entre la página (servidor), las server actions y los pasos (cliente).
// Solo tipos y constantes: no importa nada del servidor.

export const PASOS_ENVIO = ["destino", "sucursal", "detalles", "revisar", "listo"] as const;
export type PasoEnvio = (typeof PASOS_ENVIO)[number];

/** Pasos que exigen sesión de pasajero (el primero es público). Nombres viejos de `?paso=`: ruta → destino, destinatario → detalles. */
export const PASOS_CON_SESION: readonly PasoEnvio[] = ["sucursal", "detalles", "revisar", "listo"];

/** Una ciudad con ruta activa: claves como se guardan en la base ("zulia", "maracaibo"). */
export interface CiudadConRuta {
  ciudad: string;
  estado: string;
}

/** Ciudades entre las que alguna cooperativa activa tiene ruta. */
export interface RutasEnvio {
  origenes: CiudadConRuta[];
  /** origen (clave) → destinos con ruta desde ese origen. */
  destinosPorOrigen: Record<string, CiudadConRuta[]>;
}

/** Una cooperativa que cubre la ruta, con el costo estimado del envío. */
export interface OpcionEnvio {
  cooperativaId: string;
  cooperativa: string;
  calificacion: number | null;
  duracionMin: number | null;
  /** Máximos de la tarifa de la cooperativa (null si no se conocen). */
  pesoMaxKg: number | null;
  dimensionesMaxCm: number | null;
  costoUsd: number;
  /** null si no hay tasa BCV vigente. */
  costoBs: number | null;
}

export type Cotizacion =
  | {
      tipo: "ok";
      opciones: OpcionEnvio[];
      tasa: number | null;
      tasaFecha: string | null;
      /** Peso con el que se cotizó. */
      pesoKg: number;
      /** true si la persona no escribió peso y se cotizó 1 kg de referencia. */
      referencia: boolean;
    }
  | { tipo: "sin_opciones" }
  | { tipo: "invalido"; campo: "origen" | "destino" | "peso"; mensaje: string }
  | { tipo: "no_disponible" }
  | { tipo: "limite"; espera: string }
  | { tipo: "error" };

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
}

export type ResultadoSucursales = { ok: true; sucursales: Sucursal[] } | { ok: false; error: string };

export type ModalidadEnvio = "ORIGEN" | "DESTINO";

export interface EntradaRegistro {
  origen: string;
  destino: string;
  cooperativaId: string;
  receptorNombre: string;
  receptorCedula: string;
  receptorTelefono: string;
  descripcion: string;
  /** Peso aproximado en kg, o null. */
  pesoKg: number | null;
  /** Valor declarado en USD, o null. */
  valorUsd: number | null;
  modalidad: ModalidadEnvio;
  /** Ruta del objeto en `fotos-encomiendas` (`<uid>/<uuid>.<ext>`), o null. */
  fotoPath: string | null;
  idempotencyKey: string;
}

export type ResultadoRegistro =
  | { ok: true; id: string; trackingId: string | null }
  | { ok: false; error: string; campo?: "destinatario" | "descripcion" | "perfil" | "sesion" };

/** Lo que el paso "Listo" necesita mostrar. */
export interface EnvioRegistrado {
  id: string;
  trackingId: string | null;
  cooperativa: string;
  origen: string;
  destino: string;
  sucursal: Sucursal | null;
  modalidad: ModalidadEnvio;
  /** Texto "Costo estimado" ya formateado, o null. */
  estimado: string | null;
}
