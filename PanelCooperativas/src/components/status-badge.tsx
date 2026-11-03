import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dominioDeEstado, estadoInfo, tonoEstado, type Dominio, type Tono } from "@/lib/estados";
import type { EstadoEncomienda } from "@/lib/types/encomiendas";
import type { EstadoBoleto } from "@/lib/types/boletos";
import type { EstadoUiBoleto } from "@/lib/types/pagos";

/** @deprecated usar EstadoEncomienda de lib/types/encomiendas. */
export type EncomiendaEstado = EstadoEncomienda;

// Tokens del sistema (≥ 6:1 en claro y en oscuro): fondo `*-light` y texto
// `*-deep` del mismo matiz. Nunca texto blanco sobre verde o azul (2,5–3,7:1).
const CLASES: Record<Tono, { variant: "outline" | "secondary"; className?: string }> = {
  neutro: { variant: "outline" },
  pendiente: {
    variant: "secondary",
    className: "bg-warning-light text-warning-deep",
  },
  exito: {
    variant: "secondary",
    className: "bg-success-light text-success-deep",
  },
  info: {
    variant: "secondary",
    className: "bg-info-light text-info-deep",
  },
  terminado: {
    variant: "secondary",
    className: "bg-muted text-foreground",
  },
  peligro: {
    variant: "secondary",
    className: "bg-destructive-light text-destructive-deep",
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
