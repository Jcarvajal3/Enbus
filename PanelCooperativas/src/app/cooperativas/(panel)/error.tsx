"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowClockwise, CloudWarning, SpinnerIcon } from "@phosphor-icons/react";

// Error de una sección del panel. Nunca muestra el texto técnico del error
// (en producción Next.js lo oculta y en desarrollo puede traer datos internos):
// solo el código `digest` para cruzarlo con los registros del servidor.
export default function PanelError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Next.js 16: vuelve a pedir los datos y a renderizar la sección. */
  unstable_retry?: () => void;
  reset: () => void;
}) {
  const [reintentando, setReintentando] = useState(false);

  useEffect(() => {
    console.error("[PanelError]", error);
  }, [error]);

  const reintentar = () => {
    setReintentando(true);
    (unstable_retry ?? reset)();
    // Si vuelve a fallar, esta pantalla se monta de nuevo; si no, desaparece.
    window.setTimeout(() => setReintentando(false), 4000);
  };

  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <CloudWarning size={48} className="text-destructive-text" weight="duotone" aria-hidden />
      </div>
      <h2 className="text-2xl font-bold">No pudimos cargar esta sección</h2>
      <p className="max-w-md text-muted-foreground">
        Reintenta; si sigue pasando, avísanos
        {error.digest ? (
          <>
            {" "}con este código: <span className="font-mono font-medium text-foreground">{error.digest}</span>
          </>
        ) : (
          "."
        )}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button onClick={reintentar} disabled={reintentando} aria-busy={reintentando || undefined}>
          {reintentando ? <SpinnerIcon className="animate-spin" aria-hidden /> : <ArrowClockwise aria-hidden />}
          {reintentando ? "Reintentando…" : "Reintentar"}
        </Button>
        <Link href="/cooperativas/dashboard" className={buttonVariants({ variant: "outline" })}>
          Volver al resumen
        </Link>
      </div>
    </div>
  );
}
