"use client";

import { useEffect, useState } from "react";

type PreviewState = { blob: Blob; url: string };

/**
 * Genera una URL de vista previa (`URL.createObjectURL`) para un `Blob` y la
 * revoca automáticamente al cambiar de `blob` o desmontarse el componente.
 */
export function useBlobPreviewUrl(blob: Blob | null): string | null {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    let activo = true;
    queueMicrotask(() => {
      if (activo) setPreview({ blob, url });
    });
    return () => {
      activo = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  if (!blob) return null;
  return preview?.blob === blob ? preview.url : null;
}
