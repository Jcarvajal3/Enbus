"use client";

// ─── Foto del paquete en la taquilla (P-35, PC-30) ──────────────────────────
// Se puede cerrar. Tres salidas: "Tomar foto" (cámara del equipo), "Subir
// archivo" (en el teléfono abre la cámara trasera) u "Omitir por ahora" con un
// motivo; la encomienda queda marcada "Falta foto" y se agrega desde el detalle.
// La foto va al bucket privado en "<encomiendaId>/<ts>.jpg" y se guarda la RUTA.
// Se guarda entera, con la proporción que tenga (sin recortes): solo se reduce a
// 1600 px por el lado mayor y se comprime en JPEG para que suba rápido.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUUpLeft, Camera, CameraSlash, Check, FastForward, UploadSimple } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_FOTOS, rutaNuevaFoto } from "@/lib/fotos";
import { humanizeError, isNetworkError } from "@/lib/errores";
import { guardarFotoEncomienda } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { cn } from "@/lib/utils";
import { AvisoError } from "@/components/aviso-error";
import { avisarExito, avisarInfo } from "@/lib/avisos";

const MSG_ERROR_SUBIDA = "No pudimos subir la foto. Intenta de nuevo o súbela después desde el detalle.";
const MOTIVOS_OMITIR = ["La cámara no funciona", "El cliente tiene prisa", "Otro"];
const MAX_BYTES = 10 * 1024 * 1024;
const LADO_MAXIMO = 1600;

interface PhotoCaptureModalProps {
  encomiendaId: string;
  /** Código de seguimiento, para el título. */
  trackingId?: string;
  isOpen: boolean;
  /** Se cerró sin foto ni motivo: la encomienda queda "Falta foto". */
  onClose: () => void;
  /** Se guardó la foto o el motivo para omitirla. */
  onListo: (resultado: "foto" | "omitida") => void;
  /** Texto del paso siguiente, p. ej. "Después: cobrar el envío". */
  siguiente?: string;
}

type Modo = "camara" | "vista" | "omitir";

/**
 * Cámara trasera con su cuadro nativo. Pedir un tamaño fijo (p. ej. 1280×720)
 * hacía que el navegador recortara la imagen del sensor a 16:9; con
 * `resizeMode: "none"` solo se usan los modos reales de la cámara, y las
 * preferencias de tamaño solo eligen el de mejor resolución.
 */
const VIDEO_CAMARA: MediaTrackConstraints & { resizeMode?: "none" | "crop-and-scale" } = {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 1440 },
  resizeMode: "none",
};

/**
 * Reduce la foto a 1600 px por el lado mayor (JPEG 80 %) para que suba rápido,
 * con su misma proporción: nunca recorta. Si falla, deja la original.
 */
async function prepararImagen(archivo: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? archivo), "image/jpeg", 0.8));
  } catch {
    return archivo;
  }
}

function extensionDe(tipo: string): string {
  if (tipo === "image/png") return "png";
  if (tipo === "image/webp") return "webp";
  return "jpg";
}

function mensajeCamara(err: unknown): string {
  const nombre = (err as { name?: string })?.name;
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "El navegador no dio permiso para usar la cámara. Sube la foto desde un archivo o permite la cámara en la barra de direcciones.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "Este equipo no tiene cámara. Sube la foto desde un archivo u omítela por ahora.";
  }
  if (nombre === "NotReadableError") {
    return "Otra aplicación está usando la cámara. Ciérrala, o sube la foto desde un archivo.";
  }
  return "No pudimos encender la cámara. Sube la foto desde un archivo u omítela por ahora.";
}

export function PhotoCaptureModal({ encomiendaId, trackingId, isOpen, onClose, onListo, siguiente }: PhotoCaptureModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const uid = useId();

  const [modo, setModo] = useState<Modo>("camara");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [motivoOtro, setMotivoOtro] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  /** Última foto ya subida al bucket (para reintentar solo el guardado). */
  const subida = useRef<{ foto: Blob; ruta: string } | null>(null);

  const apagarCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // Cámara encendida solo mientras se está en "Tomar foto".
  useEffect(() => {
    if (!isOpen || modo !== "camara") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin API de cámara: aviso inmediato
      setCameraError("Este navegador no permite usar la cámara aquí. Sube la foto desde un archivo u omítela por ahora.");
      return;
    }
    let vigente = true;
    navigator.mediaDevices
      .getUserMedia({ video: VIDEO_CAMARA })
      .then((s) => {
        if (!vigente) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        setCameraError(null);
      })
      .catch((err: unknown) => {
        if (vigente) setCameraError(mensajeCamara(err));
      });
    return () => {
      vigente = false;
      apagarCamara();
    };
  }, [isOpen, modo, apagarCamara]);

  // El video siempre está montado: se le asigna la cámara cuando llega.
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Liberar la vista previa anterior.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const mostrarFoto = (blob: Blob) => {
    setFoto(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setError(null);
    setModo("vista");
  };

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const escala = Math.min(1, LADO_MAXIMO / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No pudimos tomar la foto. Intenta de nuevo o súbela desde un archivo.");
          return;
        }
        apagarCamara();
        mostrarFoto(blob);
      },
      "image/jpeg",
      0.8
    );
  };

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      setError("Elige una imagen (JPG o PNG).");
      return;
    }
    const lista = await prepararImagen(archivo);
    if (lista.size > MAX_BYTES) {
      setError("La foto pesa más de 10 MB. Toma otra o elige una más liviana.");
      return;
    }
    apagarCamara();
    mostrarFoto(lista);
  };

  const otraFoto = () => {
    setFoto(null);
    setPreviewUrl(null);
    setError(null);
    setModo("camara");
  };

  const guardarFoto = async () => {
    if (!foto || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      // Si la foto ya subió y lo que falló fue guardarla en la encomienda, el
      // reintento reutiliza ese archivo (no deja copias huérfanas en el bucket).
      let ruta = subida.current?.foto === foto ? subida.current.ruta : null;
      if (!ruta) {
        const tipo = foto.type || "image/jpeg";
        const nueva = rutaNuevaFoto(encomiendaId, extensionDe(tipo));
        const { error: errorSubida } = await supabase.storage.from(BUCKET_FOTOS).upload(nueva, foto, { contentType: tipo });
        if (errorSubida) throw errorSubida;
        subida.current = { foto, ruta: nueva };
        ruta = nueva;
      }
      const res = await guardarFotoEncomienda(encomiendaId, { ruta });
      if (!res.success) {
        setError(res.error);
        return;
      }
      avisarExito("Foto guardada.");
      onListo("foto");
    } catch (err) {
      setError(isNetworkError(err) ? humanizeError(err) : MSG_ERROR_SUBIDA);
    } finally {
      setGuardando(false);
    }
  };

  const motivoFinal = chip && chip !== "Otro" ? chip : motivoOtro.trim();

  const omitir = async () => {
    if (guardando) return;
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

  const cerrar = () => {
    if (guardando) return;
    apagarCamara();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === "omitir" ? "Omitir la foto por ahora" : "Foto del paquete"}</DialogTitle>
          <DialogDescription>
            {modo === "omitir"
              ? "Queda marcada «Falta foto»: agrégala después desde su detalle."
              : `Con la guía visible${trackingId ? ` (${trackingId})` : ""}. Sirve de prueba si hay un reclamo.`}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={archivoRef}
          id={`${uid}-archivo`}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void elegirArchivo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {modo === "camara" && (
          <div className="flex flex-col gap-4">
            {cameraError ? (
              <Alert>
                <CameraSlash aria-hidden />
                <AlertTitle>No se puede usar la cámara</AlertTitle>
                <AlertDescription>{cameraError}</AlertDescription>
              </Alert>
            ) : (
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border bg-black">
                {/* Se ve el cuadro completo que se guardará: object-contain, sin recortar los bordes. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Vista de la cámara"
                  className={cn("size-full object-contain", !stream && "invisible")}
                />
                {!stream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                    <Spinner size="md" />
                    <span className="text-sm">Encendiendo la cámara…</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" onClick={capturar} disabled={!stream || guardando}>
                <Camera aria-hidden />
                Tomar foto
              </Button>
              <Button size="lg" variant="outline" onClick={() => archivoRef.current?.click()} disabled={guardando}>
                <UploadSimple aria-hidden />
                Subir archivo
              </Button>
            </div>
          </div>
        )}

        {modo === "vista" && previewUrl && (
          <div className="flex flex-col gap-4">
            {/* Con su proporción (vertical u horizontal): la foto se guarda tal cual. */}
            <div className="flex w-full justify-center overflow-hidden rounded-md border border-border bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Vista previa de la foto del paquete"
                className="h-auto max-h-[min(60vh,28rem)] w-auto max-w-full object-contain"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" variant="outline" onClick={otraFoto} disabled={guardando}>
                <ArrowUUpLeft aria-hidden />
                Tomar otra
              </Button>
              <Button size="lg" onClick={() => void guardarFoto()} disabled={guardando} aria-busy={guardando || undefined} autoFocus>
                {guardando ? <Spinner size="sm" /> : <Check aria-hidden />}
                {guardando ? "Subiendo…" : "Guardar foto"}
              </Button>
            </div>
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
                  size="sm"
                  variant="outline"
                  className={cn(
                    chip === m && "border-accent-strong bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong/90"
                  )}
                  aria-pressed={chip === m}
                  disabled={guardando}
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
                  disabled={guardando}
                  onChange={(e) => {
                    setMotivoOtro(e.target.value);
                    setErrorMotivo(null);
                  }}
                />
              </div>
            )}
            {errorMotivo && <p className="text-sm text-destructive-text">{errorMotivo}</p>}
            <DialogFooter className="mt-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setModo("camara")} disabled={guardando}>
                Atrás
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <Spinner size="sm" />}
                {guardando ? "Guardando…" : "Omitir por ahora"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {error && <AvisoError>{error}</AvisoError>}

        {modo !== "omitir" && (
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                apagarCamara();
                setError(null);
                setModo("omitir");
              }}
              disabled={guardando}
            >
              <FastForward aria-hidden />
              Omitir por ahora
            </Button>
            {siguiente && <p className="text-sm text-muted-foreground">{siguiente}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
