"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/error-state";

// Error de una parte del Resumen (que se carga en el servidor): "Reintentar"
// vuelve a pedir la página sin perder el resto.
export function ErrorRecargable({ titulo, descripcion }: { titulo: string; descripcion?: string }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  return (
    <ErrorState
      compacto
      titulo={titulo}
      descripcion={descripcion}
      onReintentar={() => new Promise<void>((listo) => iniciar(() => { router.refresh(); listo(); }))}
    />
  );
}
