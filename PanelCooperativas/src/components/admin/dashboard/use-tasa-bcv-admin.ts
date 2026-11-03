"use client";

// ─── Tasa BCV en las pantallas del super admin ──────────────────────────────
// El layout de admin envuelve con TasaBCVProvider (tasa leída en el servidor).
// Este hook usa, en orden: la tasa que manda la página (`inicial`), la del
// contexto o, si se usa fuera de un provider, la consulta una vez en el navegador.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { filaATasaBCV, type TasaBCV } from "@/lib/types/pagos";

/**
 * Tasa BCV vigente para mostrar montos de referencia en Bs.
 * - `inicial` definido (aunque sea null): se usa tal cual, sin consultar.
 * - `inicial` sin definir: contexto o consulta a `fn_tasa_bcv_vigente`.
 */
export function useTasaBCVAdmin(inicial?: TasaBCV | null): TasaBCV | null {
  const contexto = useTasaBCV();
  const [consultada, setConsultada] = useState<TasaBCV | null>(null);
  const debeConsultar = inicial === undefined && !contexto;

  useEffect(() => {
    if (!debeConsultar) return;
    let activo = true;
    const consultar = async () => {
      const { data, error }: { data: unknown; error: unknown } = await createClient()
        .rpc("fn_tasa_bcv_vigente")
        .maybeSingle();
      if (!activo || error) return;
      setConsultada(filaATasaBCV(data as Parameters<typeof filaATasaBCV>[0]));
    };
    void consultar();
    return () => {
      activo = false;
    };
  }, [debeConsultar]);

  if (inicial !== undefined) return inicial;
  return contexto ?? consultada;
}
