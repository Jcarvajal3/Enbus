import type { ReactNode } from "react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Piezas comunes de las fichas del admin ─────────────────────────────────
// Un dato (etiqueta `text-xs` + valor), el vacío "—", el contador de una pestaña
// (misma pastilla que `TabsUrl`) y la tarjeta que envuelve una tabla.

/** Etiqueta y valor; va dentro de un `<dl>`. */
export function Dato({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Dato que falta. */
export function Vacio({ texto = "—" }: { texto?: string }) {
  return <span className="text-muted-foreground">{texto}</span>;
}

/** Contador de una pestaña (el `TabsTrigger` lleva `group/tab`). 0 no se dibuja. */
export function ConteoPestana({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="min-w-5 rounded-full bg-background px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-muted">
      {n}
    </span>
  );
}

/** Clase de cada `TabsTrigger` con contador. */
export const CLASE_PESTANA = "group/tab flex-none";

/** Tarjeta con título y una tabla a todo el ancho debajo (§2.3: tabla dentro de la tarjeta, sin caja propia). */
export function TarjetaTabla({
  titulo,
  descripcion,
  accion,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="py-5">
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
        {accion && <CardAction>{accion}</CardAction>}
      </CardHeader>
      <div className="border-t border-border">{children}</div>
    </Card>
  );
}
