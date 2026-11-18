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
      <dt className="text-[13px] text-muted-foreground">{etiqueta}</dt>
      <dd className="text-[15px] text-foreground">{children}</dd>
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
    <span className="min-w-5 rounded-full bg-surface-dark px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-surface">
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
    // En móvil es "nativa": sin fondo ni sombra (las filas son tarjetas sueltas) y la cabecera
    // al ras del borde de la página. Desde md, tarjeta con tabla.
    <Card className={cn("gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none", className)}>
      <CardHeader className="p-5 max-md:px-0">
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
        {accion && <CardAction>{accion}</CardAction>}
      </CardHeader>
      <div>{children}</div>
    </Card>
  );
}
