"use client";

// ─── usePasoEnUrl: el paso de un asistente vive en `?paso=` ─────────────────
// Equivalente web de `useWizardBack` (app): avanzar APILA una entrada en el
// historial, así que "atrás" del navegador = paso anterior; recargar conserva
// el paso (si el estado necesario ya no existe, vuelve al último paso válido
// con `replace`).
//
//   const PASOS = ["salida", "asientos", "pasajeros", "pago"] as const;
//   const { paso, numero, total, siguiente, anterior } = usePasoEnUrl(PASOS, {
//     esAccesible: (p) => p === "salida" || viaje !== null,
//   });
//   <FlujoPagina titulo={TITULOS[paso]} paso={numero} total={total} … />
//
// Detalles:
// - El primer paso omite el parámetro (`/ruta`), los demás llevan `?paso=<id>`.
// - Conserva el resto de parámetros (`viaje`, `volver`, …) y el `#hash`.
// - Actualiza la URL con la History API nativa (soportada por Next 16, se
//   integra con el router): NO hay petición al servidor ni se vuelve a pedir la
//   página. Por eso NO usa `useSearchParams` (no exige <Suspense>): lee
//   `window.location` y se suscribe a `popstate` y a un evento propio.
// - Limitación: un `router.push/replace` de Next que solo cambie la query y se
//   haga desde fuera de este hook no avisa a la suscripción hasta el siguiente
//   `popstate`. Cambia el paso siempre con `ir/siguiente/anterior`.

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const EVENTO = "enbus:paso-en-url";

export type OpcionesPasoEnUrl<P extends string> = {
  /** Nombre del parámetro de la URL. Por defecto `paso`. */
  param?: string;
  /**
   * ¿Hay estado suficiente para estar en este paso? Si el paso de la URL no es
   * accesible (p. ej. recarga sin el viaje elegido) se hace `replace` al paso
   * accesible más cercano hacia atrás. Por defecto todos lo son.
   */
  esAccesible?: (paso: P) => boolean;
};

export type PasoEnUrl<P extends string> = {
  /** Paso actual (el primero si la URL no trae `?paso=` o trae un valor desconocido). */
  paso: P;
  /** Posición base 0 en `pasos`. */
  indice: number;
  /** Posición base 1, lista para `<FlujoPagina paso={numero}>`. */
  numero: number;
  total: number;
  /** Va al paso `p`: `push` por defecto; con `reemplazar` no añade entrada al historial. */
  ir: (p: P, opciones?: { reemplazar?: boolean }) => void;
  /** Avanza al siguiente paso (push). No hace nada en el último. */
  siguiente: () => void;
  /**
   * Retrocede un paso. Si el paso anterior es de donde se vino, usa
   * `history.back()` (no ensucia el historial); si no, hace `replace` al anterior.
   * No hace nada en el primero: para salir usa `useSalidaProtegida`.
   */
  anterior: () => void;
};

function leerParam(param: string): string {
  return new URLSearchParams(window.location.search).get(param) ?? "";
}

function urlConPaso(param: string, valor: string | null): string {
  const url = new URL(window.location.href);
  if (valor) url.searchParams.set(param, valor);
  else url.searchParams.delete(param);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function usePasoEnUrl<P extends string>(
  pasos: readonly P[],
  opciones: OpcionesPasoEnUrl<P> = {}
): PasoEnUrl<P> {
  const { param = "paso", esAccesible } = opciones;

  const suscribir = useCallback((aviso: () => void) => {
    window.addEventListener("popstate", aviso);
    window.addEventListener(EVENTO, aviso);
    return () => {
      window.removeEventListener("popstate", aviso);
      window.removeEventListener(EVENTO, aviso);
    };
  }, []);
  const crudo = useSyncExternalStore(
    suscribir,
    () => leerParam(param),
    () => ""
  );

  const indiceUrl = pasos.indexOf(crudo as P);
  const desconocido = crudo !== "" && indiceUrl < 0;
  const indice = indiceUrl < 0 ? 0 : indiceUrl;
  const paso = pasos[indice];
  const accesible = esAccesible ? esAccesible(paso) : true;

  // Última versión de lo que usan los callbacks estables.
  const ultimo = useRef({ pasos, param, esAccesible, indice });
  useEffect(() => {
    ultimo.current = { pasos, param, esAccesible, indice };
  });

  // Pasos desde los que se avanzó con push (el último es el "anterior" real del historial).
  const pila = useRef<P[]>([]);

  const ir = useCallback((destino: P, op?: { reemplazar?: boolean }) => {
    const { pasos: ps, param: nombre } = ultimo.current;
    const i = ps.indexOf(destino);
    if (i < 0) return;
    const valor = i === 0 ? null : destino;
    if (leerParam(nombre) === (valor ?? "")) return;
    const url = urlConPaso(nombre, valor);
    if (op?.reemplazar) {
      window.history.replaceState(null, "", url);
    } else {
      pila.current.push(ps[ultimo.current.indice]);
      window.history.pushState(null, "", url);
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  const siguiente = useCallback(() => {
    const { pasos: ps, indice: i } = ultimo.current;
    if (i < ps.length - 1) ir(ps[i + 1]);
  }, [ir]);

  const anterior = useCallback(() => {
    const { pasos: ps, indice: i } = ultimo.current;
    if (i <= 0) return;
    const previo = ps[i - 1];
    const cima = pila.current[pila.current.length - 1];
    if (cima === previo) {
      pila.current.pop();
      window.history.back();
    } else {
      ir(previo, { reemplazar: true });
    }
  }, [ir]);

  // "Atrás" del navegador: mantiene la pila en línea con el historial.
  useEffect(() => {
    const alRetroceder = () => {
      const { pasos: ps, param: nombre } = ultimo.current;
      const actual = leerParam(nombre) || ps[0];
      if (pila.current[pila.current.length - 1] === actual) pila.current.pop();
    };
    window.addEventListener("popstate", alRetroceder);
    return () => window.removeEventListener("popstate", alRetroceder);
  }, []);

  // Paso desconocido o sin estado suficiente (recarga): `replace` al último accesible.
  useEffect(() => {
    if (!desconocido && accesible) return;
    const { pasos: ps, esAccesible: ok } = ultimo.current;
    let destino = 0;
    for (let i = (desconocido ? ps.length : indice) - 1; i >= 0; i--) {
      if (!ok || ok(ps[i])) {
        destino = i;
        break;
      }
    }
    ir(ps[destino], { reemplazar: true });
  }, [desconocido, accesible, indice, ir]);

  return { paso, indice, numero: indice + 1, total: pasos.length, ir, siguiente, anterior };
}
