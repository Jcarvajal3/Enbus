"use client";

// ─── Asientos ocupados de una salida ─────────────────────────────────────────
// Lee los boletos RESERVADO / PAGADO / USADO del viaje (incluye el formato antiguo
// "3B", normalizado a número). Se vuelve a leer cada vez que se entra al paso
// ("Elige los asientos"): mientras tanto se conserva lo último leído de ESE viaje
// para no vaciar el mapa, y el servidor rechaza igual un asiento tomado.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/errores";
import { asientoNumerico } from "../seat-selector";

export function useAsientosOcupados(viajeId: string | null, activo: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [datos, setDatos] = useState<{ viajeId: string; ocupados: ReadonlySet<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Última lectura: una respuesta vieja (otro viaje) no pisa la nueva.
  const lecturaRef = useRef(0);

  const leer = useCallback(async () => {
    if (!viajeId) return;
    const lectura = ++lecturaRef.current;
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from("boletos")
        .select("asiento")
        .eq("viaje_id", viajeId)
        .in("estado", ["RESERVADO", "PAGADO", "USADO"]);
      if (e) throw e;
      if (lectura !== lecturaRef.current) return;
      const lista = ((data as { asiento: string }[] | null) ?? []).map((b) => asientoNumerico(b.asiento));
      setDatos({ viajeId, ocupados: new Set(lista) });
    } catch (err) {
      if (lectura !== lecturaRef.current) return;
      // Con una lectura previa de este viaje se conserva (el servidor igual rechaza un asiento tomado).
      setError(humanizeError(err, "cargar los asientos"));
    }
  }, [supabase, viajeId]);

  useEffect(() => {
    if (!activo || !viajeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta al entrar al paso
    void leer();
  }, [activo, viajeId, leer]);

  const delViaje = datos && datos.viajeId === viajeId ? datos.ocupados : null;
  return {
    ocupados: delViaje,
    /** Sin ninguna lectura de este viaje todavía. */
    cargando: Boolean(viajeId) && delViaje === null && !error,
    /** Error de la última lectura solo cuando no hay datos que mostrar. */
    error: delViaje === null ? error : null,
    recargar: leer,
  };
}
