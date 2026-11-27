// ─── Borrador local del envío (sessionStorage) ───────────────────────────────
// Sobrevive a recargar o a ir a iniciar sesión y volver. Contiene datos de personas: vive bajo
// `enbus:` para que `limpiarBorradoresLocales` lo borre al cerrar sesión. Todo en try/catch:
// sin almacenamiento el flujo funciona igual, solo que no recuerda.

import type { EnvioRegistrado, ModalidadEnvio } from "./tipos";

// v2: el peso pasó al paso de detalles y entra en el borrador (la v1 no lo tenía).
const CLAVE_BORRADOR = "enbus:enviar:borrador:v2";
const CLAVE_BORRADOR_VIEJA = "enbus:enviar:borrador";
const CLAVE_LISTO = "enbus:enviar:listo";

export interface BorradorEnvio {
  nombre: string;
  cedula: string;
  telefono: string;
  descripcion: string;
  /** Peso como se escribió ("2,5"). */
  peso: string;
  valor: string;
  modalidad: ModalidadEnvio | "";
  sucursalId: string;
  /** Clave de idempotencia del intento en curso. */
  idem: string;
}

function leer<T>(clave: string): T | null {
  try {
    const crudo = window.sessionStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Almacenamiento no disponible: no se recuerda, nada más.
  }
}

function borrar(clave: string) {
  try {
    window.sessionStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Una clave nueva por intento de envío (índice único sender_id + idempotency_key). */
export function nuevaClaveEnvio(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function leerBorrador(): BorradorEnvio | null {
  if (typeof window === "undefined") return null;
  const b = leer<Partial<Record<keyof BorradorEnvio, unknown>>>(CLAVE_BORRADOR);
  if (!b || typeof b !== "object") return null;
  return {
    nombre: texto(b.nombre),
    cedula: texto(b.cedula),
    telefono: texto(b.telefono),
    descripcion: texto(b.descripcion),
    peso: texto(b.peso),
    valor: texto(b.valor),
    modalidad: b.modalidad === "ORIGEN" || b.modalidad === "DESTINO" ? b.modalidad : "",
    sucursalId: texto(b.sucursalId),
    idem: texto(b.idem) || nuevaClaveEnvio(),
  };
}

export const guardarBorrador = (b: BorradorEnvio) => escribir(CLAVE_BORRADOR, b);
export const borrarBorrador = () => {
  borrar(CLAVE_BORRADOR);
  borrar(CLAVE_BORRADOR_VIEJA);
};

export function leerListo(): EnvioRegistrado | null {
  if (typeof window === "undefined") return null;
  const e = leer<EnvioRegistrado>(CLAVE_LISTO);
  return e && typeof e === "object" && typeof e.id === "string" ? e : null;
}
export const guardarListo = (e: EnvioRegistrado) => escribir(CLAVE_LISTO, e);
export const borrarListo = () => borrar(CLAVE_LISTO);
