"use client";

// ─── Comprobante opcional del cobro en taquilla ─────────────────────────────
// Foto o imagen del comprobante de Pago Móvil, transferencia, Zelle o punto de venta (el voucher).
// - `ComprobanteCobro`: "Tomar foto" (cámara trasera en móvil y tablet), "Adjuntar imagen", vista
//   previa en miniatura y quitar/cambiar.
// - `useComprobanteCobro`: estado del archivo y subida al bucket privado `comprobantes-pago`. La
//   imagen se sube AL COBRAR (no al elegirla): si el cobro no se hace o se cambia a efectivo no
//   quedan archivos huérfanos. La ruta subida se recuerda para que un reintento del mismo cobro no
//   suba el archivo otra vez.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CameraIcon, ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { subirComprobante, validarArchivoComprobante } from "@/components/pagos/subir-comprobante";
import { formatNumeroVE } from "@/lib/dinero";
import { cn } from "@/lib/utils";

export type SubidaComprobante = { ok: true; path: string | null } | { ok: false; error: string };

export function useComprobanteCobro() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const subida = useRef<{ file: File; path: string } | null>(null);

  /** Elige un archivo (validándolo); `null` lo quita. */
  const elegir = useCallback((file: File | null) => {
    if (!file) {
      setArchivo(null);
      setError(null);
      return;
    }
    const invalido = validarArchivoComprobante(file);
    setError(invalido);
    if (!invalido) setArchivo(file);
  }, []);

  /** Descarta archivo y error (al cambiar a efectivo). */
  const descartar = useCallback(() => {
    setArchivo(null);
    setError(null);
  }, []);

  /** Sube el archivo elegido (si hay) y devuelve su ruta; sin archivo devuelve `path: null`. */
  const subir = useCallback(async (): Promise<SubidaComprobante> => {
    if (!archivo) return { ok: true, path: null };
    if (subida.current?.file === archivo) return { ok: true, path: subida.current.path };
    setSubiendo(true);
    try {
      const res = await subirComprobante(archivo);
      if (!res.ok) {
        setError(res.error);
        return res;
      }
      subida.current = { file: archivo, path: res.path };
      return { ok: true, path: res.path };
    } finally {
      setSubiendo(false);
    }
  }, [archivo]);

  return { archivo, error, subiendo, elegir, descartar, subir };
}

export function ComprobanteCobro({
  archivo,
  onArchivo,
  error,
  subiendo = false,
  disabled = false,
  etiqueta = "Comprobante (opcional)",
  ayuda = "Foto o imagen del comprobante de pago. JPG, PNG o WEBP · hasta 5 MB.",
  className,
}: {
  archivo: File | null;
  onArchivo(file: File | null): void;
  error?: string | null;
  subiendo?: boolean;
  disabled?: boolean;
  etiqueta?: string;
  ayuda?: string;
  className?: string;
}) {
  const id = useId();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const bloqueado = disabled || subiendo;
  const vista = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onArchivo(f);
  };
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span id={`${id}-etiqueta`} className="text-[13px] font-medium text-foreground">
        {etiqueta}
      </span>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        disabled={bloqueado}
        aria-labelledby={`${id}-etiqueta`}
        onChange={alElegir}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={bloqueado}
        aria-labelledby={`${id}-etiqueta`}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={alElegir}
      />
      {archivo && vista ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
          {/* Vista previa local (blob:): next/image no aplica. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={vista} alt="Vista previa del comprobante" className="size-16 shrink-0 rounded-md object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{archivo.name}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
              {subiendo ? (
                <>
                  <Spinner size="sm" /> Subiendo el comprobante…
                </>
              ) : (
                <>{formatNumeroVE(archivo.size / 1024 / 1024)} MB</>
              )}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={bloqueado} onClick={() => galeria.current?.click()}>
            Cambiar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={bloqueado}
            onClick={() => onArchivo(null)}
            aria-label="Quitar el comprobante"
          >
            <TrashIcon aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-11 max-md:px-4"
            disabled={bloqueado}
            onClick={() => camara.current?.click()}
          >
            <CameraIcon aria-hidden />
            Tomar foto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-11 max-md:px-4"
            disabled={bloqueado}
            onClick={() => galeria.current?.click()}
          >
            <ImageIcon aria-hidden />
            Adjuntar imagen
          </Button>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-destructive-text">
          {error}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">{ayuda}</p>
      )}
    </div>
  );
}
