"use server";

// Acción pública del sitio: rastreo de encomiendas por código. Es un endpoint público
// (cualquiera puede llamarlo con un POST): el argumento se trata como dato sin tipo y
// tiene un límite de frecuencia por IP.

import { normalizarTracking, TRACKING_RE } from "@/lib/artefactos.generated";
import { rastrear, supabaseSitio, type ResultadoRastreo } from "@/lib/sitio/consultas";
import { consumirLimitePorIp, minutosTexto, textoEntrada } from "@/lib/sitio/limites";

// 30 consultas cada 10 minutos por IP (frena a quien prueba códigos al azar).
const LIMITE_RASTREO = { prefijo: "rastreo", maximo: 30, ventanaSegundos: 10 * 60 } as const;

/** Resultado de la búsqueda, con lo que se escribió (para reponerlo en el campo). */
export type EstadoRastreo = (
  | ResultadoRastreo
  | { tipo: "inicial" }
  | { tipo: "vacio" }
  | { tipo: "formato"; codigo: string }
  /** Falta la configuración de Supabase en el servidor. */
  | { tipo: "no_disponible" }
  /** Demasiadas consultas seguidas desde la misma conexión. */
  | { tipo: "limite"; espera: string }
) & { entrada?: string };

/** Busca una encomienda por su código de seguimiento (EB-AAMMDD-NNNNN). Firma de `useActionState`. */
export async function rastrearEncomienda(_anterior: EstadoRastreo, formData: FormData): Promise<EstadoRastreo> {
  const texto = textoEntrada(formData instanceof FormData ? formData.get("codigo") : null, 60);
  return { ...(await buscar(texto)), entrada: texto.slice(0, 40) };
}

async function buscar(entrada: string): Promise<EstadoRastreo> {
  const codigo = normalizarTracking(entrada).slice(0, 40);
  if (!codigo) return { tipo: "vacio" };
  // Un texto sin la forma del código no puede existir (trigger generar_tracking_id): no se consulta.
  if (!TRACKING_RE.test(codigo)) return { tipo: "formato", codigo };

  const supabase = supabaseSitio();
  if (!supabase) return { tipo: "no_disponible" };
  const limite = await consumirLimitePorIp(
    supabase,
    LIMITE_RASTREO.prefijo,
    LIMITE_RASTREO.maximo,
    LIMITE_RASTREO.ventanaSegundos
  );
  if (!limite.permitido) return { tipo: "limite", espera: minutosTexto(limite.reintentarEnSegundos) };

  return (await rastrear(codigo)) ?? { tipo: "no_disponible" };
}
