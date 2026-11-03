import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dominioDeEstado, estadoInfo, tonoEstado, type Dominio, type Tono } from "@/lib/estados";
import type { EstadoEncomienda } from "@/lib/types/encomiendas";
import type { EstadoBoleto } from "@/lib/types/boletos";
import type { EstadoUiBoleto } from "@/lib/types/pagos";

// Tonos de sistema.md §4.1 (≥ 6:1 en claro y en oscuro): fondo `*-light` y
// texto `*-deep` del mismo matiz; neutro = contorno. Las insignias no llevan
// icono (§2.4) y van en `text-xs font-semibold` (SY-23, desde `Badge`).
const CLASES_TONO: Record<Tono, { variant: "outline" | "secondary"; className?: string }> = {
  neutro: { variant: "outline", className: "border-border bg-background text-foreground" },
  pendiente: { variant: "secondary", className: "bg-warning-light text-warning-deep" },
  exito: { variant: "secondary", className: "bg-success-light text-success-deep" },
  info: { variant: "secondary", className: "bg-info-light text-info-deep" },
  terminado: { variant: "secondary", className: "bg-muted text-foreground" },
  peligro: { variant: "secondary", className: "bg-destructive-light text-destructive-deep" },
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
  const { variant, className: claseTono } = CLASES_TONO[tonoEstado(d, status, audiencia)];
  return (
    <Badge variant={variant} className={cn(claseTono, className)} title={info.ayuda}>
      {audiencia === "pasajero" ? info.pasajero : info.operador}
    </Badge>
  );
}

/**
 * Aviso con tono que no es un estado ("Quedan 3", "Sin sucursal",
 * "2 ciclos sin pagar"): misma forma que `StatusBadge`, texto libre.
 */
export function TonoBadge({ tono, children, className }: { tono: Tono; children: ReactNode; className?: string }) {
  const { variant, className: claseTono } = CLASES_TONO[tono];
  return (
    <Badge variant={variant} className={cn(claseTono, className)}>
      {children}
    </Badge>
  );
}
