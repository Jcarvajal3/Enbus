"use client";

import { useRef, useState } from "react";
import { ArrowClockwise, CloudWarning, SpinnerIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Error honesto con "Reintentar" (#19, DS-08) ─────────────────────────────
// Para una sección que quedó vacía porque falló la carga: dice qué pasó y
// permite reintentar, con carga visible mientras corre `onReintentar`.

export type ErrorStateProps = {
  titulo: string;
  /** Normalmente `humanizeError(err, "cargar …")`. */
  descripcion?: string;
  onReintentar(): Promise<void> | void;
  /** Versión en línea para tarjetas o tablas pequeñas. */
  compacto?: boolean;
  className?: string;
};

export function ErrorState({ titulo, descripcion, onReintentar, compacto = false, className }: ErrorStateProps) {
  const [reintentando, setReintentando] = useState(false);
  const enCurso = useRef(false);

  const reintentar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setReintentando(true);
    try {
      await onReintentar();
    } catch {
      // El consumidor muestra el error nuevo (vuelve a renderizar este estado);
      // aquí solo se evita que la promesa rechazada quede sin manejar.
    } finally {
      enCurso.current = false;
      setReintentando(false);
    }
  };

  const boton = (
    <Button
      type="button"
      variant="outline"
      size={compacto ? "sm" : "default"}
      onClick={reintentar}
      disabled={reintentando}
      aria-busy={reintentando || undefined}
    >
      {reintentando ? (
        <SpinnerIcon className="animate-spin" aria-hidden />
      ) : (
        <ArrowClockwise aria-hidden />
      )}
      {reintentando ? "Reintentando…" : "Reintentar"}
    </Button>
  );

  if (compacto) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <CloudWarning className="mt-0.5 size-5 shrink-0 text-destructive-text" weight="duotone" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-foreground">{titulo}</p>
            {descripcion && <p className="text-muted-foreground">{descripcion}</p>}
          </div>
        </div>
        {boton}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center p-12 text-center", className)}
    >
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <CloudWarning className="size-8 text-destructive-text" weight="duotone" aria-hidden />
      </div>
      <h3 className="text-lg font-medium">{titulo}</h3>
      {descripcion && <p className="mt-1 mb-6 max-w-sm text-sm text-muted-foreground">{descripcion}</p>}
      {!descripcion && <div className="mb-6" />}
      {boton}
    </div>
  );
}
