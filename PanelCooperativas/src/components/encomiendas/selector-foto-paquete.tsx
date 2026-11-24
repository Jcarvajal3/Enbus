"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash, UploadSimple } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useBlobPreviewUrl } from "@/hooks/use-blob-preview";
import { useEsDispositivoMovil } from "@/hooks/use-mobile";
import { MAX_FOTO_BYTES, prepararImagenArchivo } from "@/lib/fotos-archivo";
import { cn } from "@/lib/utils";

const MAX_FOTO_MB = Math.round(MAX_FOTO_BYTES / (1024 * 1024));

export interface SelectorFotoPaqueteProps {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
  ayuda?: string;
  error?: string | null;
  onProcesando?: (procesando: boolean) => void;
  etiquetaBoton?: string;
  permitirQuitar?: boolean;
  className?: string;
}

export function SelectorFotoPaquete({
  value,
  onChange,
  disabled = false,
  ayuda,
  error,
  onProcesando,
  etiquetaBoton,
  permitirQuitar = true,
  className,
}: SelectorFotoPaqueteProps): React.JSX.Element {
  const uid = useId();
  const esMovil = useEsDispositivoMovil();
  const previewUrl = useBlobPreviewUrl(value);

  const [procesando, setProcesando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const galeriaRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const solicitudRef = useRef(0);
  const arrastreContadorRef = useRef(0);
  const onProcesandoRef = useRef(onProcesando);

  useEffect(() => {
    onProcesandoRef.current = onProcesando;
  }, [onProcesando]);

  useEffect(() => {
    return () => {
      // Invalida cualquier procesamiento en curso y evita dejar ocupado al padre al desmontar.
      solicitudRef.current += 1;
      onProcesandoRef.current?.(false);
    };
  }, []);

  const bloqueado = disabled || procesando;
  const mensajeError = errorLocal || error;

  const procesarArchivo = async (archivo: File | undefined) => {
    if (!archivo || disabled) return;
    const idSolicitud = ++solicitudRef.current;
    setErrorLocal(null);
    setProcesando(true);
    onProcesando?.(true);

    try {
      const resultado = await prepararImagenArchivo(archivo);
      if (solicitudRef.current !== idSolicitud) return;
      if (!resultado.ok) {
        setErrorLocal(resultado.error);
        return;
      }
      onChange(resultado.blob);
    } finally {
      if (solicitudRef.current === idSolicitud) {
        setProcesando(false);
        onProcesando?.(false);
      }
    }
  };

  const manejarCambioInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    // Permite volver a seleccionar exactamente el mismo archivo.
    e.target.value = "";
    if (archivo) {
      void procesarArchivo(archivo);
    }
  };

  const quitarFoto = () => {
    if (disabled) return;
    solicitudRef.current += 1;
    setProcesando(false);
    onProcesando?.(false);
    setErrorLocal(null);
    onChange(null);
  };

  const manejarDragEnter = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (bloqueado || !e.dataTransfer.types.includes("Files")) return;
    arrastreContadorRef.current += 1;
    setArrastrando(true);
  };

  const manejarDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (bloqueado || !e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "copy";
    if (!arrastrando) {
      setArrastrando(true);
    }
  };

  const manejarDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes("Files")) return;
    arrastreContadorRef.current = Math.max(0, arrastreContadorRef.current - 1);
    if (arrastreContadorRef.current === 0) {
      setArrastrando(false);
    }
  };

  const manejarDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    arrastreContadorRef.current = 0;
    setArrastrando(false);
    if (bloqueado) return;
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) {
      void procesarArchivo(archivo);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Input de galería sin `capture`: abre archivos en escritorio y galería nativa en móvil. */}
      <input
        ref={galeriaRef}
        id={`${uid}-galeria`}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={bloqueado}
        onChange={manejarCambioInput}
      />

      {/* Input dedicado con `capture="environment"` solo en móvil para abrir la cámara trasera. */}
      {esMovil && (
        <input
          ref={camaraRef}
          id={`${uid}-camara`}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={bloqueado}
          onChange={manejarCambioInput}
        />
      )}

      {!value ? (
        esMovil ? (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => camaraRef.current?.click()}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-input-border bg-card px-4 py-4 text-[15px] font-semibold text-foreground transition-colors outline-none",
                  "hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "disabled:pointer-events-none disabled:bg-surface-dark disabled:text-muted-foreground"
                )}
              >
                <Camera className="size-6 shrink-0" aria-hidden />
                <span>Tomar foto</span>
              </button>

              <button
                type="button"
                disabled={bloqueado}
                onClick={() => galeriaRef.current?.click()}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-input-border bg-card px-4 py-4 text-[15px] font-semibold text-foreground transition-colors outline-none",
                  "hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "disabled:pointer-events-none disabled:bg-surface-dark disabled:text-muted-foreground"
                )}
              >
                <ImageIcon className="size-6 shrink-0" aria-hidden />
                <span>Galería</span>
              </button>
            </div>

            {procesando ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
                <Spinner size="sm" />
                <span>Preparando foto…</span>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {ayuda ?? `JPG, PNG o WebP · hasta ${MAX_FOTO_MB} MB.`}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => galeriaRef.current?.click()}
              onDragEnter={manejarDragEnter}
              onDragOver={manejarDragOver}
              onDragLeave={manejarDragLeave}
              onDrop={manejarDrop}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-6 text-center transition-colors outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:opacity-75",
                arrastrando
                  ? "border-accent-strong bg-accent-light"
                  : "border-border-strong bg-surface hover:bg-muted/70"
              )}
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-subtle",
                  arrastrando && "text-accent-strong"
                )}
              >
                {procesando ? (
                  <Spinner size="md" />
                ) : (
                  <UploadSimple className="size-5" aria-hidden />
                )}
              </span>

              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold text-foreground">
                  {procesando
                    ? "Preparando foto…"
                    : arrastrando
                      ? "Suelta la imagen aquí"
                      : "Agrega una foto del paquete"}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {`JPG, PNG o WebP · hasta ${MAX_FOTO_MB} MB. Haz clic o arrastra la imagen aquí.`}
                </span>
              </span>

              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "pointer-events-none"
                )}
              >
                {procesando ? <Spinner size="sm" /> : <ImageIcon aria-hidden />}
                {procesando ? "Preparando foto…" : (etiquetaBoton ?? "Agregar foto")}
              </span>
            </button>

            {ayuda && <p className="text-[13px] text-muted-foreground">{ayuda}</p>}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vista previa de la foto del paquete"
                className="h-auto max-h-[min(50vh,22rem)] w-auto max-w-full object-contain"
              />
            ) : (
              <div className="flex h-44 w-full items-center justify-center">
                <Spinner size="md" />
              </div>
            )}

            {procesando && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night/60 text-white"
                role="status"
              >
                <Spinner size="md" />
                <span className="text-[15px] font-medium">Preparando foto…</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            {esMovil ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={bloqueado}
                  onClick={() => camaraRef.current?.click()}
                >
                  <Camera aria-hidden />
                  Tomar otra
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={bloqueado}
                  onClick={() => galeriaRef.current?.click()}
                >
                  <ImageIcon aria-hidden />
                  Galería
                </Button>
                {permitirQuitar && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={bloqueado}
                    className="text-destructive-text"
                    onClick={quitarFoto}
                  >
                    <Trash aria-hidden />
                    Quitar
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={bloqueado}
                  onClick={() => galeriaRef.current?.click()}
                >
                  <UploadSimple aria-hidden />
                  Cambiar foto
                </Button>
                {permitirQuitar && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={bloqueado}
                    className="text-destructive-text"
                    onClick={quitarFoto}
                  >
                    <Trash aria-hidden />
                    Quitar foto
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mensajeError && <AvisoError>{mensajeError}</AvisoError>}
    </div>
  );
}
