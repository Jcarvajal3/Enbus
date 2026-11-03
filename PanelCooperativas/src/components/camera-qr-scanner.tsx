"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, ScanSmiley } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CameraQRScannerProps {
  onScan: (code: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CameraQRScanner({ onScan, open, onOpenChange }: CameraQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Stable refs so the useEffect dep array stays on `open` only.
  // This prevents the camera from restarting if the parent re-renders
  // with new inline function references.
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    // Lazy-loaded jsQR instance
    let jsQRFn: typeof import("jsqr").default | null = null;

    async function start() {
      setCameraError(null);
      setScanning(false);
      try {
        // Lazy-load jsQR (~100KB) only when camera opens
        const jsQRModule = await import("jsqr");
        jsQRFn = jsQRModule.default;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        setScanning(true);
        scanLoop();
      } catch (err: unknown) {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "El navegador no dio permiso para usar la cámara. Permítelo en la configuración del sitio e intenta de nuevo."
            : "No pudimos abrir la cámara. Revisa que ninguna otra aplicación la esté usando e intenta de nuevo.";
        setCameraError(message);
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !active || !jsQRFn) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQRFn(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          // Use refs so we always call the latest callback version
          onScanRef.current(code.data);
          onOpenChangeRef.current(false);
          return;
        }
      }

      animationRef.current = requestAnimationFrame(scanLoop);
    }

    start();

    return () => {
      active = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]); // Intentionally only `open` — callbacks are in stable refs

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <ScanSmiley size={22} weight="duotone" aria-hidden />
            Escanear con la cámara
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black aspect-video overflow-hidden">
          {/* Video stream */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Hidden canvas used for frame analysis */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanning overlay */}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52">
                {/* Corner brackets */}
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-sm" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-sm" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-sm" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-sm" />
                {/* Scan line animation */}
                <span className="absolute left-2 right-2 h-0.5 bg-primary/80 top-1/2 motion-safe:animate-scan-line" />
              </div>
              <p className="absolute bottom-4 text-white text-sm font-medium drop-shadow">
                Apunta la cámara al código QR
              </p>
            </div>
          )}

          {/* Error state */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <Camera size={40} className="text-destructive" aria-hidden />
              <p className="text-white text-sm">{cameraError}</p>
            </div>
          )}

          {/* Loading state */}
          {!scanning && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60" role="status" aria-label="Abriendo la cámara">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="px-4 py-3 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X size={16} className="mr-2" aria-hidden />
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger button — standalone, composable
// ─────────────────────────────────────────────────────────────────────────────

interface CameraQRTriggerProps {
  onScan: (code: string) => void;
  disabled?: boolean;
}

export function CameraQRTrigger({ onScan, disabled = false }: CameraQRTriggerProps) {
  const [open, setOpen] = useState(false);

  // El resultado lo anuncia la pantalla (panel "Último escaneo" con sonido): sin toast aparte.
  function handleScan(code: string) {
    onScan(code);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Escanear con cámara"
        title="Escanear con cámara"
        className="shrink-0 h-12 w-12"
      >
        <Camera size={20} weight="duotone" aria-hidden />
      </Button>
      <CameraQRScanner onScan={handleScan} open={open} onOpenChange={setOpen} />
    </>
  );
}
