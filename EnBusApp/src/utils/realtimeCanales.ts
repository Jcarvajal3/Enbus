/**
 * Canales Realtime compartidos (Broadcast privado desde la base).
 *
 * La base publica cada cambio en un canal privado (migración 20261127000005):
 *   - `usuario:<id>`: boletos, encomiendas y notificaciones de ese usuario;
 *   - `viaje:<id>`: cambios de cupo o de estado de una salida.
 * Solo el dueño puede unirse a `usuario:<id>` (política en `realtime.messages`), y el permiso
 * se revisa una vez al unirse, no por mensaje. Por eso escala mucho mejor que `postgres_changes`.
 *
 * Aquí se abre UN canal por tema, compartido por todas las pantallas que lo escuchan
 * (contador de referencias). Antes cada pasajero abría 4–5 suscripciones.
 *
 * Segundo plano: al pasar la app a segundo plano se cierran los canales. Sin canales, el
 * socket se desconecta, así que solo ocupan conexión de Realtime los usuarios con la app en
 * pantalla. Al volver se reabren, y `alReconectar` avisa a cada oyente para que relea lo que
 * cambió mientras tanto. Lo mismo pasa tras una caída del socket.
 */
import { AppState, type AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OperacionCambio = 'INSERT' | 'UPDATE' | 'DELETE';

/** Mensaje que publica la base (evento `cambio`). */
export interface CambioFila {
  tabla: string;
  op: OperacionCambio;
  /** Fila completa tras el cambio (null en DELETE). En `viaje:<id>` solo id, cupo y estado. */
  nuevo: Record<string, unknown> | null;
  /** Solo `{ id }` de la fila anterior (null en INSERT). */
  viejo: { id: string } | null;
}

export interface OyenteCanal {
  alCambio: (cambio: CambioFila) => void;
  /** El canal se volvió a unir (app de vuelta en primer plano o socket recuperado). */
  alReconectar?: () => void;
}

interface Tema {
  oyentes: Set<OyenteCanal>;
  canal: RealtimeChannel | null;
  /** Ya estuvo suscrito alguna vez: la próxima suscripción es una reconexión. */
  suscritoAntes: boolean;
  /** Cierre en curso: abrir de nuevo espera a que termine (mismo nombre de canal). */
  cerrando: Promise<unknown> | null;
}

const temas = new Map<string, Tema>();
let enPrimerPlano = AppState.currentState !== 'background';

function avisar(tema: Tema, fn: (o: OyenteCanal) => void) {
  // Copia: un oyente puede darse de baja mientras se recorre.
  for (const o of [...tema.oyentes]) {
    try {
      fn(o);
    } catch (err) {
      if (__DEV__) console.warn('[realtimeCanales] Error en un oyente:', err);
    }
  }
}

async function abrir(nombre: string, tema: Tema) {
  if (tema.cerrando) await tema.cerrando;
  if (tema.canal || tema.oyentes.size === 0 || !enPrimerPlano) return;

  // supabase.channel() devuelve el canal existente si hay uno con el mismo nombre. Si quedó
  // uno a medio cerrar (p. ej. sin red al cerrarlo), se descarta antes de crear el nuevo.
  const viejo = supabase.getChannels().find((c) => c.topic === `realtime:${nombre}`);
  if (viejo) {
    viejo.teardown();
    supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== viejo);
  }

  // El canal privado necesita el token de la sesión actual.
  await supabase.realtime.setAuth().catch(() => {});
  if (tema.canal || tema.oyentes.size === 0 || !enPrimerPlano) return;

  tema.canal = supabase
    .channel(nombre, { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, (mensaje) => {
      const cambio = mensaje.payload as CambioFila | undefined;
      if (cambio && typeof cambio.tabla === 'string') avisar(tema, (o) => o.alCambio(cambio));
    })
    .subscribe((estado, err) => {
      if (estado === 'SUBSCRIBED') {
        if (tema.suscritoAntes) avisar(tema, (o) => o.alReconectar?.());
        tema.suscritoAntes = true;
      } else if (__DEV__ && (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')) {
        console.warn(`[realtimeCanales] ${nombre}: ${estado}`, err?.message ?? '');
      }
    });
}

function cerrar(tema: Tema) {
  const canal = tema.canal;
  if (!canal) return;
  tema.canal = null;
  tema.cerrando = supabase
    .removeChannel(canal)
    .catch(() => {})
    .finally(() => {
      tema.cerrando = null;
    });
}

/**
 * Escucha un tema (`usuario:<id>` o `viaje:<id>`). Devuelve la función para dejar de escuchar;
 * con el último oyente fuera, el canal se cierra.
 */
export function escucharCanal(nombre: string, oyente: OyenteCanal): () => void {
  let tema = temas.get(nombre);
  if (!tema) {
    tema = { oyentes: new Set(), canal: null, suscritoAntes: false, cerrando: null };
    temas.set(nombre, tema);
  }
  tema.oyentes.add(oyente);
  void abrir(nombre, tema);

  const t = tema;
  return () => {
    t.oyentes.delete(oyente);
    if (t.oyentes.size > 0) return;
    cerrar(t);
    temas.delete(nombre);
  };
}

/** Canal de los cambios del usuario: boletos, encomiendas y notificaciones. */
export function escucharUsuario(usuarioId: string, oyente: OyenteCanal): () => void {
  return escucharCanal(`usuario:${usuarioId}`, oyente);
}

/** Canal del cupo de una salida (la pantalla de asientos). */
export function escucharViaje(viajeId: string, oyente: OyenteCanal): () => void {
  return escucharCanal(`viaje:${viajeId}`, oyente);
}

/** Id de la fila del cambio (nueva o, en DELETE, la anterior). */
export function idDelCambio(cambio: CambioFila): string | undefined {
  const id = cambio.nuevo?.id ?? cambio.viejo?.id;
  return typeof id === 'string' ? id : undefined;
}

// Segundo plano: cerrar todo (el socket se desconecta solo). Primer plano: reabrir.
AppState.addEventListener('change', (estado: AppStateStatus) => {
  if (estado === 'background') {
    enPrimerPlano = false;
    temas.forEach((tema) => cerrar(tema));
  } else if (estado === 'active' && !enPrimerPlano) {
    enPrimerPlano = true;
    temas.forEach((tema, nombre) => void abrir(nombre, tema));
  }
});
