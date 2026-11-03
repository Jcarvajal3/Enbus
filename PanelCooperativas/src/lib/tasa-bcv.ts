// ─── Tasa BCV vigente (solo servidor) ────────────────────────────────────────
// Fuente única: RPC `fn_tasa_bcv_vigente` (última tasa con fecha <= hoy en Caracas).
// Uso en Server Components / Server Actions:
//   const tasa = await obtenerTasaBCV();   // null si no hay tasa registrada
// En componentes de cliente usa `useTasaBCV()` de components/tasa-bcv-provider.

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { filaATasaBCV, type TasaBCV } from "@/lib/types/pagos";

export type { TasaBCV };

/**
 * Tasa BCV vigente. Deduplicada por render con `cache()` (layout + página = 1 consulta).
 * Devuelve null si no hay tasa o si la consulta falla (la UI muestra el aviso).
 */
export const obtenerTasaBCV = cache(async (): Promise<TasaBCV | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("fn_tasa_bcv_vigente")
      .maybeSingle<Parameters<typeof filaATasaBCV>[0]>();
    if (error) {
      console.error("No se pudo leer la tasa BCV:", error.message);
      return null;
    }
    return filaATasaBCV(data);
  } catch (err) {
    // cookies() lanza un error interno de Next para marcar la ruta como dinámica: no se traga.
    unstable_rethrow(err);
    console.error("No se pudo leer la tasa BCV:", err);
    return null;
  }
});
