"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

// Error de una sección del admin. Nunca muestra el texto técnico del error
// (en producción Next.js lo oculta y en desarrollo puede traer datos internos):
// solo el código `digest` para cruzarlo con los registros del servidor.
export default function AdminPanelError({
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
    console.error("[AdminPanelError]", error);
  }, [error]);

  const reintentar = () => {
    setReintentando(true);
    // `reset` solo vuelve a renderizar sin pedir los datos: un fallo de la consulta se repetiría.
    (unstable_retry ?? reset)();
    // Si vuelve a fallar, esta pantalla se monta de nuevo; si no, desaparece.
    window.setTimeout(() => setReintentando(false), 4000);
  };

  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive-light">
        <WarningCircle className="size-8 text-destructive-deep" aria-hidden />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h1 className="text-base font-semibold text-foreground">No pudimos cargar esta sección</h1>
        <p className="text-sm text-muted-foreground">
          {error.digest ? (
            <>
              Si sigue pasando, avísanos con este código:{" "}
              <span className="font-mono font-medium text-foreground">{error.digest}</span>
            </>
          ) : (
            "Reintenta en unos segundos."
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={INICIO_ADMIN} className={buttonVariants({ variant: "outline" })}>
          Ir al Resumen
        </Link>
        <Button onClick={reintentar} disabled={reintentando} aria-busy={reintentando || undefined}>
          {reintentando ? <Spinner size="sm" aria-hidden /> : <ArrowClockwise aria-hidden />}
          {reintentando ? "Reintentando…" : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}
