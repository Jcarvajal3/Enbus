import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dominioDeEstado, estadoInfo, tonoEstado, type Dominio, type Tono } from "@/lib/estados";
import type { EstadoEncomienda } from "@/lib/types/encomiendas";
import type { EstadoBoleto } from "@/lib/types/boletos";
import type { EstadoUiBoleto } from "@/lib/types/pagos";

/** @deprecated usar EstadoEncomienda de lib/types/encomiendas. */
export type EncomiendaEstado = EstadoEncomienda;

// Colores accesibles (≥ 4,5:1 en claro y en oscuro): fondo suave y texto oscuro
// del mismo matiz. Nunca texto blanco sobre verde o azul (2,5–3,7:1).
const CLASES: Record<Tono, { variant: "outline" | "secondary"; className?: string }> = {
  neutro: { variant: "outline" },
  pendiente: {
    variant: "secondary",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  },
  exito: {
    variant: "secondary",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  },
  info: {
    variant: "secondary",
    className: "bg-blue-100 text-blue-900 dark:bg-blue-400/15 dark:text-blue-200",
  },
  terminado: {
    variant: "secondary",
    className: "bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-200",
  },
  peligro: {
    variant: "secondary",
    className: "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200",
  },
};

/**
 * Insignia de estado con el vocabulario único de lib/estados.
 * `dominio` evita ambigüedades (PENDIENTE de un pago ≠ PENDIENTE de una
 * cooperativa); si falta, se deduce del estado. Un estado desconocido se
 * muestra legible y en tono neutro.
 */
export function StatusBadge({
  status,
  dominio,
  audiencia = "operador",
  className,
}: {
  status: EstadoEncomienda | EstadoBoleto | EstadoUiBoleto | string | null | undefined;
  dominio?: Dominio;
  audiencia?: "operador" | "pasajero";
  className?: string;
}) {
  const d = dominio ?? dominioDeEstado(status) ?? "encomienda";
  const info = estadoInfo(d, status);
  const { variant, className: claseTono } = CLASES[tonoEstado(d, status, audiencia)];
  return (
    <Badge variant={variant} className={cn(claseTono, className)} title={info.ayuda}>
      {audiencia === "pasajero" ? info.pasajero : info.operador}
    </Badge>
  );
}
