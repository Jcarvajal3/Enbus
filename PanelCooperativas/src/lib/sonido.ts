// ─── Sonido del mostrador (#43, PC-19) ───────────────────────────────────────
// Tonos cortos con Web Audio (OscillatorNode): sin archivos ni dependencias.
//   éxito: 880 Hz 80 ms + 1320 Hz 80 ms (sine)
//   error: 220 Hz 300 ms (square, volumen 0,15)
//   aviso: 660 Hz 150 ms (sine)
// Preferencia por equipo en localStorage ("enbus.sonido"), activada por defecto.
// Solo cliente: en el servidor no suena nada y nunca lanza. Con el sonido
// desactivado no se crea ningún AudioContext.

export type TipoSonido = "exito" | "error" | "aviso";

const CLAVE = "enbus.sonido";
/** Evento que avisa a otros componentes de la misma pestaña que cambió la preferencia. */
const EVENTO = "enbus:sonido";

type Nota = { frecuencia: number; duracion: number; forma: OscillatorType; volumen: number };

const SONIDOS: Record<TipoSonido, Nota[]> = {
  exito: [
    { frecuencia: 880, duracion: 0.08, forma: "sine", volumen: 0.25 },
    { frecuencia: 1320, duracion: 0.08, forma: "sine", volumen: 0.25 },
  ],
  error: [{ frecuencia: 220, duracion: 0.3, forma: "square", volumen: 0.15 }],
  aviso: [{ frecuencia: 660, duracion: 0.15, forma: "sine", volumen: 0.25 }],
};

let contexto: AudioContext | null = null;
/** Respaldo si localStorage no está disponible (modo privado, bloqueado). */
let preferenciaEnMemoria: boolean | null = null;

function enNavegador() {
  return typeof window !== "undefined";
}

/** true si este equipo tiene el sonido activado (por defecto, sí). En el servidor, false. */
export function sonidoActivado(): boolean {
  if (!enNavegador()) return false;
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado === null) return preferenciaEnMemoria ?? true;
    return guardado !== "0" && guardado !== "false";
  } catch {
    return preferenciaEnMemoria ?? true;
  }
}

/** Guarda la preferencia de este equipo (localStorage "enbus.sonido"). */
export function setSonidoActivado(v: boolean): void {
  if (!enNavegador()) return;
  preferenciaEnMemoria = v;
  try {
    window.localStorage.setItem(CLAVE, v ? "1" : "0");
  } catch {
    // Sin almacenamiento: queda la preferencia en memoria hasta recargar.
  }
  if (!v && contexto) {
    const ctx = contexto;
    contexto = null;
    ctx.close().catch(() => {
      // Cerrar es solo para liberar el audio; si falla no hay nada que avisar.
    });
  }
  try {
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Navegadores muy antiguos sin `new Event`: los suscriptores se enteran al recargar.
  }
}

/**
 * Suscripción a los cambios de la preferencia (esta pestaña y otras), para
 * `useSyncExternalStore(suscribirSonido, sonidoActivado, () => true)`.
 */
export function suscribirSonido(cambio: () => void): () => void {
  if (!enNavegador()) return () => {};
  const alAlmacenar = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE) cambio();
  };
  window.addEventListener(EVENTO, cambio);
  window.addEventListener("storage", alAlmacenar);
  return () => {
    window.removeEventListener(EVENTO, cambio);
    window.removeEventListener("storage", alAlmacenar);
  };
}

function obtenerContexto(): AudioContext | null {
  if (contexto && contexto.state !== "closed") return contexto;
  const Constructor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  contexto = new Constructor();
  return contexto;
}

function tocarNota(ctx: AudioContext, nota: Nota, inicio: number) {
  const osc = ctx.createOscillator();
  const ganancia = ctx.createGain();
  osc.type = nota.forma;
  osc.frequency.setValueAtTime(nota.frecuencia, inicio);
  // Subida y bajada de 5 ms: evita el "clic" al empezar y al terminar.
  const fin = inicio + nota.duracion;
  ganancia.gain.setValueAtTime(0, inicio);
  ganancia.gain.linearRampToValueAtTime(nota.volumen, inicio + 0.005);
  ganancia.gain.setValueAtTime(nota.volumen, Math.max(inicio + 0.005, fin - 0.005));
  ganancia.gain.linearRampToValueAtTime(0, fin);
  osc.connect(ganancia);
  ganancia.connect(ctx.destination);
  osc.onended = () => {
    osc.disconnect();
    ganancia.disconnect();
  };
  osc.start(inicio);
  osc.stop(fin + 0.01);
}

/** Suena el tono indicado. No hace nada si está desactivado o sin Web Audio; nunca lanza. */
export function reproducirSonido(tipo: TipoSonido): void {
  if (!enNavegador() || !sonidoActivado()) return;
  try {
    const ctx = obtenerContexto();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // El navegador exige un gesto antes de sonar: el siguiente escaneo (tecla) lo habilita.
      });
    }
    let inicio = ctx.currentTime + 0.01;
    for (const nota of SONIDOS[tipo] ?? []) {
      tocarNota(ctx, nota, inicio);
      inicio += nota.duracion;
    }
  } catch {
    // El sonido es un refuerzo: si el audio falla, el resultado ya se ve en pantalla.
  }
}
