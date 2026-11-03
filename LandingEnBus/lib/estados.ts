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

/** Clases de Tailwind por tono (texto ≥ 4,5:1 sobre su fondo). */
export const CLASES_TONO: Record<TonoEstado, string> = {
  pendiente: "bg-amber-100 text-amber-900",
  info: "bg-blue-100 text-blue-900",
  exito: "bg-emerald-100 text-emerald-900",
  peligro: "bg-red-100 text-red-900",
  terminado: "bg-slate-200 text-slate-800",
  neutro: "border border-border bg-background text-foreground",
};

/** Ejemplo y formato del código de seguimiento (EB-AAMMDD-NNNNN). */
export const CODIGO_EJEMPLO = "EB-261003-12345";

/**
 * Limpia el código como lo escriba la persona: " eb 261003 12345" o "EB26100312345"
 * -> "EB-261003-12345". Si no tiene la forma esperada, lo devuelve en mayúsculas y
 * sin espacios (la base decide si existe). Cadena vacía si no hay nada.
 */
export function normalizarCodigoSeguimiento(entrada: string | null | undefined): string {
  const limpio = (entrada ?? "").toUpperCase().replace(/[\s_.]/g, "").slice(0, 40);
  const m = /^EB-?(\d{6})-?(\d{5})$/.exec(limpio);
  return m ? `EB-${m[1]}-${m[2]}` : limpio;
}

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

// ─── Nombres de ciudades y estados ───────────────────────────────────────────
// Las rutas guardan la localidad normalizada ("puerto_la_cruz", "anzoategui"), igual
// que `normalizar_localidad` en la base. Para mostrarla se usa el nombre con tildes
// (copia de las etiquetas de PanelCooperativas/src/lib/data/venezuela.ts).

const NOMBRES_LOCALIDAD: Record<string, string> = {
  // Estados
  amazonas: "Amazonas", anzoategui: "Anzoátegui", apure: "Apure", aragua: "Aragua", barinas: "Barinas",
  bolivar: "Bolívar", carabobo: "Carabobo", cojedes: "Cojedes", delta_amacuro: "Delta Amacuro",
  distrito_capital: "Distrito Capital", falcon: "Falcón", guarico: "Guárico", lara: "Lara", merida: "Mérida",
  miranda: "Miranda", monagas: "Monagas", nueva_esparta: "Nueva Esparta", portuguesa: "Portuguesa",
  sucre: "Sucre", tachira: "Táchira", trujillo: "Trujillo", la_guaira: "La Guaira", yaracuy: "Yaracuy",
  zulia: "Zulia",
  // Ciudades
  puerto_ayacucho: "Puerto Ayacucho", barcelona: "Barcelona", puerto_la_cruz: "Puerto La Cruz",
  lecheria: "Lechería", el_tigre: "El Tigre", san_fernando: "San Fernando de Apure", guadualito: "Guadualito",
  maracay: "Maracay", turmero: "Turmero", cagua: "Cagua", la_victoria: "La Victoria", socopo: "Socopó",
  ciudad_bolivar: "Ciudad Bolívar", puerto_ordaz: "Puerto Ordaz", san_felix: "San Félix", upata: "Upata",
  valencia: "Valencia", puerto_cabello: "Puerto Cabello", guacara: "Guacara", san_diego: "San Diego",
  san_carlos: "San Carlos", tinaquillo: "Tinaquillo", tucupita: "Tucupita", caracas: "Caracas", coro: "Coro",
  punto_fijo: "Punto Fijo", san_juan: "San Juan de los Morros", valle_de_la_pascua: "Valle de la Pascua",
  calabozo: "Calabozo", barquisimeto: "Barquisimeto", cabudare: "Cabudare", carora: "Carora",
  el_vigia: "El Vigía", tovar: "Tovar", los_teques: "Los Teques", guarenas: "Guarenas", guatire: "Guatire",
  charallave: "Charallave", maturin: "Maturín", punta_de_mata: "Punta de Mata", porlamar: "Porlamar",
  la_asuncion: "La Asunción", pampatar: "Pampatar", guanare: "Guanare", acarigua: "Acarigua",
  araure: "Araure", cumana: "Cumaná", carupano: "Carúpano", san_cristobal: "San Cristóbal", tario: "Táriba",
  tariba: "Táriba", rubio: "Rubio", valera: "Valera", bocono: "Boconó", maiquetia: "Maiquetía",
  catia_la_mar: "Catia La Mar", san_felipe: "San Felipe", yritagua: "Yaritagua", yaritagua: "Yaritagua",
  chivacoa: "Chivacoa", maracaibo: "Maracaibo", cabimas: "Cabimas", ciudad_ojeda: "Ciudad Ojeda",
  machiques: "Machiques",
};

const CONECTORES = new Set(["de", "del", "la", "las", "los", "y"]);

/**
 * "puerto_la_cruz" -> "Puerto La Cruz"; "merida" -> "Mérida". Si ya viene con
 * mayúsculas y no está en la lista, se respeta tal cual. Cadena vacía si no hay dato.
 */
export function nombreLocalidad(valor: string | null | undefined): string {
  const original = (valor ?? "").trim();
  if (!original) return "";
  const clave = original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "_");
  const conocido = NOMBRES_LOCALIDAD[clave];
  if (conocido) return conocido;
  if (/[A-ZÁÉÍÓÚÑ]/.test(original) && !original.includes("_")) return original;
  return clave
    .split("_")
    .filter(Boolean)
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
