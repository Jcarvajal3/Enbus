"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/error-state";

// ─── Error con "Reintentar" en una página del servidor (AD5-20) ─────────────
// `ErrorState` necesita una función: este envoltorio vuelve a pedir la página
// (`router.refresh()`) sin recargar el navegador.

export function ErrorRefrescar({
  titulo,
  descripcion,
  compacto = true,
  className,
}: {
  titulo: string;
  descripcion?: string;
  compacto?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ErrorState
      titulo={titulo}
      descripcion={descripcion}
      compacto={compacto}
      className={className}
      onReintentar={() =>
        new Promise<void>((resolve) => {
          startTransition(() => {
            router.refresh();
            resolve();
          });
        })
      }
    />
  );
}
