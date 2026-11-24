"use client";

// ─── Foto del paquete en la taquilla (P-35, PC-30) ──────────────────────────
// Contenido reutilizable: lo usan la fase "Foto del paquete" de la página de
// nueva encomienda y `PhotoCaptureModal` (recepción de encomiendas de la app y
// "Agregar foto" del detalle). En escritorio ofrece selección desde archivos o
// arrastrar y soltar; en móvil ofrece "Tomar foto" (cámara trasera nativa) y
// "Galería" sin recorte. También permite "Omitir por ahora" con un motivo.
//
// No pinta título ni cierre: quien lo monta pone el título (`tituloFoto(modo)`)
// y la descripción (`descripcionFoto(modo, trackingId)`), y se entera del modo
// con `onModo` y de que hay procesamiento o subida en curso con `onOcupado`.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, Check, FastForward, Image as ImageIcon, UploadSimple } from "@phosphor-icons/react";
import { guardarFotoEncomienda } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { AvisoError } from "@/components/aviso-error";
import { SelectorFotoPaquete } from "@/components/encomiendas/selector-foto-paquete";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useBlobPreviewUrl } from "@/hooks/use-blob-preview";
import { useEsDispositivoMovil } from "@/hooks/use-mobile";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import {
  prepararImagenArchivo,
  subirYGuardarFotoEncomienda,
  type CacheSubidaFoto,
} from "@/lib/fotos-archivo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MOTIVOS_OMITIR = ["La cámara no funciona", "El cliente tiene prisa", "Otro"];

export type ModoFoto = "seleccion" | "vista" | "omitir";

export interface FotoPaqueteProps {
  encomiendaId: string;
  /** Código de seguimiento, para la descripción. */
  trackingId?: string;
  /** Se guardó la foto o el motivo para omitirla. */
  onListo: (resultado: "foto" | "omitida", ruta?: string) => void;
  /** Texto del paso siguiente, p. ej. "Después: cobrar el envío". */
  siguiente?: string;
  /** Cambia entre selección, vista previa y "omitir" (para el título de quien lo monta). */
  onModo?: (modo: ModoFoto) => void;
  /** Hay una preparación, subida o guardado en curso (quien lo monta no debe cerrar). */
  onOcupado?: (ocupado: boolean) => void;
  className?: string;
}

export function tituloFoto(modo: ModoFoto): string {
  return modo === "omitir" ? "Omitir la foto por ahora" : "Foto del paquete";
}

export function descripcionFoto(modo: ModoFoto, trackingId?: string): string {
  return modo === "omitir"
    ? "Queda marcada «Falta foto»: agrégala después desde su detalle."
    : `Con la guía visible${trackingId ? ` (${trackingId})` : ""}. Sirve de prueba si hay un reclamo.`;
}

export function FotoPaquete({
  encomiendaId,
  onListo,
  siguiente,
  onModo,
  onOcupado,
  className,
}: FotoPaqueteProps): React.JSX.Element {
  const supabase = useMemo(() => createClient(), []);
  const uid = useId();
  const esMovil = useEsDispositivoMovil();

  const [foto, setFoto] = useState<Blob | null>(null);
  const [modo, setModo] = useState<ModoFoto>("seleccion");
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [motivoOtro, setMotivoOtro] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);

  const previewUrl = useBlobPreviewUrl(foto);

  const galeriaRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const solicitudRef = useRef(0);
  /** Última foto ya subida al bucket (para reintentar solo el guardado). */
  const cacheRef = useRef<CacheSubidaFoto | null>(null);

  const ocupado = guardando || procesando;

  useEffect(() => {
    onModo?.(modo);
  }, [modo, onModo]);

  useEffect(() => {
    onOcupado?.(ocupado);
  }, [ocupado, onOcupado]);

  useEffect(() => {
    return () => {
      solicitudRef.current += 1;
    };
  }, []);

  const procesarNuevaFoto = async (archivo: File | undefined) => {
    if (!archivo || guardando) return;
    const idSolicitud = ++solicitudRef.current;
    setError(null);
    setProcesando(true);

    try {
      const resultado = await prepararImagenArchivo(archivo);
      if (solicitudRef.current !== idSolicitud) return;
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setFoto(resultado.blob);
    } finally {
      if (solicitudRef.current === idSolicitud) {
        setProcesando(false);
      }
    }
  };

  const manejarCambioInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (archivo) {
      void procesarNuevaFoto(archivo);
    }
  };

  const guardarFoto = async () => {
    if (!foto || ocupado) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await subirYGuardarFotoEncomienda({
        supabase,
        encomiendaId,
        foto,
        cacheRef,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      avisarExito("Foto guardada.");
      onListo("foto", res.ruta);
    } finally {
      setGuardando(false);
    }
  };

  const motivoFinal = chip && chip !== "Otro" ? chip : motivoOtro.trim();

  const omitir = async () => {
    if (ocupado) return;
    if (motivoFinal.length < 3) {
      setErrorMotivo("Elige un motivo o escríbelo.");
      if (chip === "Otro") motivoRef.current?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await guardarFotoEncomienda(encomiendaId, { omitidaMotivo: motivoFinal });
      if (!res.success) {
        setError(res.error);
        return;
      }
      avisarInfo("Foto omitida. Agrégala desde el detalle.");
      onListo("omitida");
    } catch (err) {
      setError(humanizeError(err, "guardar el motivo"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {modo === "seleccion" && (
        <SelectorFotoPaquete
          value={null}
          onChange={(blob) => {
            if (blob) {
              setFoto(blob);
              setError(null);
              setModo("vista");
            }
          }}
          disabled={guardando}
          onProcesando={setProcesando}
        />
      )}

      {modo === "vista" && (
        <div className="flex flex-col gap-4">
          {/* Inputs para reemplazar la foto directamente desde `modo === "vista"`. */}
          <input
            ref={galeriaRef}
            id={`${uid}-galeria`}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            disabled={ocupado}
            onChange={manejarCambioInput}
          />
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
              disabled={ocupado}
              onChange={manejarCambioInput}
            />
          )}

          {/* Con su proporción (vertical u horizontal): la foto se guarda tal cual. */}
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vista previa de la foto del paquete"
                className="h-auto max-h-[min(50vh,22rem)] w-auto max-w-full object-contain"
              />
            ) : (
              <div className="flex h-48 w-full items-center justify-center">
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

          {esMovil ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => camaraRef.current?.click()}
                  disabled={ocupado}
                >
                  <Camera aria-hidden />
                  Tomar otra
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => galeriaRef.current?.click()}
                  disabled={ocupado}
                >
                  <ImageIcon aria-hidden />
                  Galería
                </Button>
              </div>
              <Button
                type="button"
                size="lg"
                onClick={() => void guardarFoto()}
                disabled={ocupado || !foto}
                aria-busy={guardando || undefined}
                autoFocus
              >
                {guardando ? <Spinner size="sm" /> : <Check aria-hidden />}
                {guardando ? "Subiendo…" : "Guardar foto"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => galeriaRef.current?.click()}
                disabled={ocupado}
              >
                <UploadSimple aria-hidden />
                Cambiar foto
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => void guardarFoto()}
                disabled={ocupado || !foto}
                aria-busy={guardando || undefined}
                autoFocus
              >
                {guardando ? <Spinner size="sm" /> : <Check aria-hidden />}
                {guardando ? "Subiendo…" : "Guardar foto"}
              </Button>
            </div>
          )}
        </div>
      )}

      {modo === "omitir" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void omitir();
          }}
        >
          <Label>¿Por qué la omites?</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos para omitir la foto">
            {MOTIVOS_OMITIR.map((m) => (
              <Button
                key={m}
                type="button"
                variant="outline"
                className={cn(
                  chip === m && "border-accent-strong bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong/90"
                )}
                aria-pressed={chip === m}
                disabled={ocupado}
                onClick={() => {
                  setChip(m);
                  setErrorMotivo(null);
                  if (m === "Otro") setTimeout(() => motivoRef.current?.focus(), 0);
                }}
              >
                {m}
              </Button>
            ))}
          </div>
          {chip === "Otro" && (
            <div className="grid content-start gap-2">
              <Label htmlFor={`${uid}-motivo`}>Motivo</Label>
              <Textarea
                id={`${uid}-motivo`}
                ref={motivoRef}
                rows={2}
                maxLength={300}
                value={motivoOtro}
                disabled={ocupado}
                aria-invalid={errorMotivo ? true : undefined}
                aria-describedby={errorMotivo ? `${uid}-motivo-error` : undefined}
                onChange={(e) => {
                  setMotivoOtro(e.target.value);
                  setErrorMotivo(null);
                }}
              />
            </div>
          )}
          {errorMotivo && (
            <p id={`${uid}-motivo-error`} role="alert" className="text-[13px] text-destructive-text">
              {errorMotivo}
            </p>
          )}
          <div className="mt-2 flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setError(null);
                setModo(foto ? "vista" : "seleccion");
              }}
              disabled={ocupado}
            >
              Atrás
            </Button>
            <Button type="submit" size="lg" disabled={ocupado} aria-busy={guardando || undefined}>
              {guardando && <Spinner size="sm" />}
              {guardando ? "Guardando…" : "Omitir por ahora"}
            </Button>
          </div>
        </form>
      )}

      {error && <AvisoError>{error}</AvisoError>}

      {modo !== "omitir" && (
        <div className="flex flex-col-reverse gap-3 pt-2 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(null);
              setModo("omitir");
            }}
            disabled={ocupado}
          >
            <FastForward aria-hidden />
            Omitir por ahora
          </Button>
          {siguiente && <p className="text-[13px] text-muted-foreground">{siguiente}</p>}
        </div>
      )}
    </div>
  );
}
