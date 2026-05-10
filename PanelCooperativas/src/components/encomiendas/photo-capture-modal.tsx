"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Camera, ArrowUUpLeft, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

interface PhotoCaptureModalProps {
  encomiendaId: string;
  isOpen: boolean;
  onSuccess: () => void;
}

export function PhotoCaptureModal({ encomiendaId, isOpen, onSuccess }: PhotoCaptureModalProps) {
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Use a ref for cleanup so the effect closure always has access to the latest stream
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Iniciar cámara al montar
  useEffect(() => {
    if (isOpen && !capturedImage) {
      async function startCamera() {
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          // Store in ref for cleanup and in state for rendering
          streamRef.current = mediaStream;
          setStream(mediaStream);
          setCameraError(null);
          
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
        } catch (err: unknown) {
          console.error("Error accessing camera:", err);
          const domError = err as { name?: string };
          setCameraError(
            domError.name === "NotAllowedError" 
              ? "Permiso de cámara denegado. Por favor, habilite el acceso a la cámara en su navegador." 
              : "No se pudo acceder a la cámara. Verifique que el dispositivo tenga una cámara funcional."
          );
        }
      }
      
      startCamera();
    }
    
    return () => {
      // Always use the ref for cleanup — it's always up to date
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setStream(null);
      }
    };
  }, [isOpen, capturedImage]);

  // Revoke object URL when it changes to prevent memory leaks (revoke the OLD url)
  const prevPreviewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPreviewUrlRef.current;
    prevPreviewUrlRef.current = previewUrl;
    return () => {
      if (prev) URL.revokeObjectURL(prev);
    };
  }, [previewUrl]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedImage(blob);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          
          // Stop the camera using the ref
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            setStream(null);
          }
        }
      }, "image/jpeg", 0.8);
    }
  };

  const retryPhoto = () => {
    setCapturedImage(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const uploadPhoto = async () => {
    if (!capturedImage) return;
    
    setIsUploading(true);
    
    try {
      const fileName = `${encomiendaId}/${Date.now()}.jpg`;

      // 1. Subir a Storage
      const { error: uploadError } = await supabase.storage
        .from("fotos-encomiendas")
        .upload(fileName, capturedImage, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      // 2. Obtener URL pública
      const { data: urlData } = supabase.storage
        .from("fotos-encomiendas")
        .getPublicUrl(fileName);

      // 3. Guardar URL en encomienda
      const { error: dbError } = await supabase.from("encomiendas")
        .update({ foto_evidencia_url: urlData.publicUrl })
        .eq("id", encomiendaId);
        
      if (dbError) throw dbError;

      toast.success("Foto de evidencia subida exitosamente");
      onSuccess();
    } catch (err: unknown) {
      console.error("Error uploading photo:", err);
      toast.error("Error al subir la fotografía. Por favor, reintente.");
    } finally {
      setIsUploading(false);
    }
  };

  // Prevenir cierre automático por overlay/escape per specs
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleOpenChange = (_open: boolean) => {
    // Es obligatorio, no tiene botón de cerrar.
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Captura de Evidencia</DialogTitle>
          <DialogDescription>
            Es obligatorio registrar una fotografía del paquete procesado con su guía/etiqueta visible.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {cameraError ? (
            <Alert variant="destructive" className="w-full">
              <WarningCircle className="h-5 w-5" />
              <AlertTitle>Error de Cámara</AlertTitle>
              <AlertDescription className="mt-2">
                {cameraError}
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    Recargar Página
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : !capturedImage ? (
            // ESTADO 1: Cámara Activa
            <div className="w-full flex flex-col items-center gap-4">
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border-2 border-muted">
                {stream ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Spinner size="md" className="mb-2" />
                    <span className="text-sm">Iniciando cámara...</span>
                  </div>
                )}
                
                {/* Overlay guides */}
                {stream && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-3/4 h-3/4 border-2 border-dashed border-white/50 rounded-md"></div>
                  </div>
                )}
              </div>
              
              <canvas ref={canvasRef} className="hidden" />
              
              <p className="text-sm font-medium text-center text-muted-foreground">
                Asegúrese de que el paquete y la etiqueta estén bien iluminados.
              </p>
              
              <Button 
                size="lg" 
                className="w-full rounded-full h-14" 
                onClick={capturePhoto}
                disabled={!stream}
              >
                <Camera className="w-6 h-6 mr-2" />
                Capturar Foto
              </Button>
            </div>
          ) : (
            // ESTADO 2: Preview
            <div className="w-full flex flex-col items-center gap-4">
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border-2 border-primary/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={previewUrl!} 
                  alt="Vista previa de evidencia" 
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 w-full mt-2">
                <Button 
                  variant="outline" 
                  onClick={retryPhoto}
                  disabled={isUploading}
                  className="h-12"
                >
                  <ArrowUUpLeft className="w-5 h-5 mr-2" />
                  Reintentar
                </Button>
                <Button 
                  onClick={uploadPhoto}
                  disabled={isUploading}
                  className="h-12"
                >
                  {isUploading ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <UploadSimple className="w-5 h-5 mr-2" />
                  )}
                  {isUploading ? "Subiendo..." : "Confirmar y Subir"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
