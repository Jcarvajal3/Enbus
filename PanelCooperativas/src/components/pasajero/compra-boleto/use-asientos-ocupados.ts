"use client";

// ─── Asientos ocupados de la salida, al día mientras se eligen ───────────────
// `fn_asientos_ocupados` por server action. Se vuelve a leer cada 10 s mientras el paso está a
// la vista y la pestaña visible, y al volver a la pestaña. Con una lectura previa de ESTE viaje
// se conserva (no se vacía el mapa por un fallo de red); el servidor rechaza igual un asiento tomado.

import { useCallback, useEffect, useRef, useState } from "react";
import { asientoNumerico } from "@/components/boletos/seat-selector";
import { humanizeError } from "@/lib/errores";
import { leerAsientosOcupados } from "@/app/(sitio)/comprar/boleto/acciones";

const CADA_MS = 10_000;

export function useAsientosOcupados(viajeId: string, activo: boolean) {
  const [datos, setDatos] = useState<{ viajeId: string; ocupados: ReadonlySet<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Última lectura: una respuesta vieja no pisa la nueva.
  const lecturaRef = useRef(0);

  const leer = useCallback(async () => {
    const lectura = ++lecturaRef.current;
    try {
      const r = await leerAsientosOcupados(viajeId);
      if (lectura !== lecturaRef.current) return;
      if (!r.success) {
        setError(r.error);
        return;
      }
      setError(null);
      setDatos({ viajeId, ocupados: new Set(r.data.map(asientoNumerico)) });
    } catch (err) {
      if (lectura !== lecturaRef.current) return;
      setError(humanizeError(err, "cargar los asientos"));
    }
  }, [viajeId]);

  useEffect(() => {
    if (!activo) return;
    const alVolver = () => {
      if (document.visibilityState === "visible") void leer();
    };
    // Primera lectura al entrar al paso (fuera del cuerpo del efecto: no es un setState síncrono).
    const arranque = window.setTimeout(() => void leer(), 0);
    const id = window.setInterval(alVolver, CADA_MS);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      window.clearTimeout(arranque);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [activo, leer]);

  const delViaje = datos && datos.viajeId === viajeId ? datos.ocupados : null;
  return {
    ocupados: delViaje,
    /** Error de la última lectura solo cuando no hay datos que mostrar. */
    error: delViaje === null ? error : null,
    recargar: leer,
  };
}
