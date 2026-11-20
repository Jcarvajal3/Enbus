"use client";

// ─── A/B testing temporal del paso 4 ("¿Cómo pagó?") ─────────────────────────
// Permite alternar en vivo entre dos diagramaciones sin perder los datos del
// formulario:
//   · A ("clasico"): bloque de total arriba, cuadrícula de métodos, detalles abajo.
//   · B ("lateral"): total y detalles a la izquierda; riel vertical de 6 métodos a
//                    la derecha.
//
// Cuando termine la prueba y se elija un diseño ganador:
//   1. Eliminar este archivo (`cobro-ab.tsx`).
//   2. Quitar la variante descartada y `useDisenoCobro` de `cobro-taquilla-form.tsx`.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ColumnsIcon, RowsIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type DisenoCobro = "clasico" | "lateral";

const CLAVE_STORAGE = "enbus:ab:cobro-paso4";
const EVENTO_CAMBIO = "enbus:ab-cobro-cambio";
const DISENO_DEFECTO: DisenoCobro = "lateral";
let disenoMemoria: DisenoCobro | null = null;

function parsearDiseno(valor: string | null | undefined): DisenoCobro | null {
  if (!valor) return null;
  const normalizado = valor.trim().toLowerCase();
  if (normalizado === "clasico" || normalizado === "a") return "clasico";
  if (normalizado === "lateral" || normalizado === "b") return "lateral";
  return null;
}

function leerDiseno(): DisenoCobro {
  if (typeof window === "undefined") return DISENO_DEFECTO;
  try {
    const guardado = parsearDiseno(window.localStorage.getItem(CLAVE_STORAGE));
    if (guardado) return guardado;
  } catch {
    // Modo privado o almacenamiento bloqueado: usa el respaldo en memoria.
  }
  return disenoMemoria ?? DISENO_DEFECTO;
}

function guardarDiseno(diseno: DisenoCobro) {
  disenoMemoria = diseno;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_STORAGE, diseno);
  } catch {
    // Modo privado o almacenamiento deshabilitado: el cambio igual aplica en la pestaña.
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

function suscribir(notificar: () => void) {
  const alStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_STORAGE) notificar();
  };
  window.addEventListener(EVENTO_CAMBIO, notificar);
  window.addEventListener("storage", alStorage);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, notificar);
    window.removeEventListener("storage", alStorage);
  };
}

/**
 * Estado persistente del experimento A/B del paso 4.
 * También admite `?diseno=a` o `?diseno=b` en la URL para pruebas directas.
 */
export function useDisenoCobro() {
  const diseno = useSyncExternalStore(suscribir, leerDiseno, () => DISENO_DEFECTO);

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("diseno");
      const desdeUrl = parsearDiseno(param);
      if (desdeUrl && desdeUrl !== leerDiseno()) {
        guardarDiseno(desdeUrl);
      }
    } catch {
      // Sin acceso a location.search: se mantiene la preferencia guardada.
    }
  }, []);

  const alternar = useCallback(() => {
    guardarDiseno(leerDiseno() === "lateral" ? "clasico" : "lateral");
  }, []);

  return {
    diseno,
    alternar,
    esLateral: diseno === "lateral",
  };
}

/**
 * Botón flotante discreto para cambiar entre diseño A (clásico) y B (lateral)
 * durante las pruebas A/B sin distraer al operador.
 */
export function BotonAlternarDisenoCobro({
  diseno,
  onAlternar,
}: {
  diseno: DisenoCobro;
  onAlternar: () => void;
}) {
  const esLateral = diseno === "lateral";
  const letra = esLateral ? "B" : "A";
  const siguiente = esLateral ? "A (clásico)" : "B (lateral)";

  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={esLateral}
      aria-label={`Cambiar diseño de pago a ${siguiente}`}
      title={`Diseño ${letra} · Toca para cambiar a ${siguiente}`}
      data-ab-diseno={diseno}
      className={cn(
        "fixed z-30 inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card/75 px-2.5 text-[11px] font-medium text-muted-foreground shadow-subtle backdrop-blur-sm transition-opacity outline-none",
        // Área táctil cómoda sin agrandar el aspecto visual.
        "after:absolute after:-inset-1.5",
        // Móvil: esquina inferior izquierda por encima de BarraFlujo (no estorba el riel derecho).
        "left-3 bottom-[calc(max(var(--alto-pestanas,0px),env(safe-area-inset-bottom))+7.75rem)]",
        // Escritorio: esquina inferior derecha fuera de la columna centrada max-w-2xl.
        "md:right-4 md:bottom-24 md:left-auto",
        "opacity-45 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-strong/40 active:opacity-100"
      )}
    >
      {esLateral ? (
        <ColumnsIcon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <RowsIcon className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="tabular-nums">{letra}</span>
    </button>
  );
}
