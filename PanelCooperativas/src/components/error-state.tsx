"use client";

import { useRef, useState } from "react";
import { ArrowClockwise, SpinnerIcon, WarningCircle } from "@phosphor-icons/react";
import { IconTile } from "@/components/icon-tile";
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
      size={compacto ? "sm" : "lg"}
      onClick={reintentar}
      disabled={reintentando}
      aria-busy={reintentando || undefined}
    >
      {reintentando ? (
        <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />
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
          "flex flex-col gap-3 rounded-xl bg-destructive-light p-4 sm:flex-row sm:items-center sm:justify-between",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <WarningCircle className="mt-0.5 size-5 shrink-0 text-destructive-text" aria-hidden />
          <div className="flex flex-col gap-0.5 text-[15px] text-destructive-deep">
            <p className="font-semibold">{titulo}</p>
            {descripcion && <p>{descripcion}</p>}
          </div>
        </div>
        {boton}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-5 px-6 py-14 text-center", className)}
    >
      <IconTile icon={WarningCircle} tone="danger" size="xl" />
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="font-heading text-[17px] font-semibold tracking-tight text-foreground">{titulo}</h3>
        {descripcion && <p className="text-[15px] text-muted-foreground">{descripcion}</p>}
      </div>
      {boton}
    </div>
  );
}
