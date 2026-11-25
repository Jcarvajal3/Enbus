import "server-only";

// ─── Pagos del pasajero: lectura en servidor ─────────────────────────────────
// Usa el cliente de sesión: la RLS de `metodos_pago_cooperativa` deja a cualquier usuario
// autenticado leer las cuentas activas. Los componentes de cliente importan los tipos y la
// validación de `./pagos-comun` (este archivo no se puede importar desde el cliente).

import { createClient } from "@/lib/supabase/server";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { TIPOS_METODO_PASAJERO, type MetodoPagoPasajero, type TipoMetodoPagoPasajero } from "./pagos-comun";

export * from "./pagos-comun";

type FilaMetodo = {
  id: string;
  tipo: string;
  banco: string | null;
  titular: string | null;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
  instrucciones: string | null;
};

const ORDEN: Record<TipoMetodoPagoPasajero, number> = { PAGO_MOVIL: 0, TRANSFERENCIA_BANCARIA: 1, ZELLE: 2 };

/** Cuentas activas de la cooperativa donde se puede pagar en línea. Vacío si no hay o si falla la lectura. */
export async function leerMetodosPago(cooperativaId: string): Promise<MetodoPagoPasajero[]> {
  if (!cooperativaId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metodos_pago_cooperativa")
    .select("id, tipo, banco, titular, numero_cuenta, cedula_rif, email_zelle, instrucciones")
    .eq("cooperativa_id", cooperativaId)
    .eq("activo", true)
    .in("tipo", [...TIPOS_METODO_PASAJERO])
    .returns<FilaMetodo[]>();
  if (error) {
    console.error("No se pudieron leer los métodos de pago:", error.message);
    return [];
  }
  return (data ?? [])
    .map((f) => ({
      id: f.id,
      tipo: f.tipo as TipoMetodoPagoPasajero,
      banco: f.banco?.trim() || null,
      titular: f.titular?.trim() ?? "",
      numeroCuenta: f.numero_cuenta?.trim() || null,
      cedulaRif: f.cedula_rif?.trim() || null,
      emailZelle: f.email_zelle?.trim() || null,
      instrucciones: f.instrucciones?.trim() || null,
    }))
    .sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
}

/** Tasa BCV vigente (`fn_tasa_bcv_vigente`) o null si no hay. Bs por 1 USD y fecha 'YYYY-MM-DD'. */
export async function leerTasaVigente(): Promise<{ tasa: number; fecha: string } | null> {
  const t = await obtenerTasaBCV();
  return t ? { tasa: t.tasa, fecha: t.fecha } : null;
}
