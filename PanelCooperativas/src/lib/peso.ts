import { formatNumeroVE } from "@/lib/dinero";

/**
 * Peso en kg con hasta 2 decimales y sin ceros sobrantes ("25", "25,5", "12,25").
 * Los pesos se guardan con 2 decimales: mostrarlos con menos cambiaría el valor visible.
 * Es el mismo formato que usa la app móvil (`formatPesoKg`).
 */
export function formatPesoKg(kg: number): string {
  return formatNumeroVE(kg, 2).replace(/,00$/, "").replace(/(,\d)0$/, "$1");
}
