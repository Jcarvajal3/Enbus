"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon, WarningCircle } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";

// Nunca muestra el texto técnico del error: solo el `digest` para cruzarlo con los registros.
export default function AdminPanelError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Next.js 16.2: vuelve a pedir los datos del servidor y a renderizar la sección. */
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
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center text-foreground">
      <div className="rounded-full bg-destructive/10 p-4">
        <WarningCircle size={48} className="text-destructive-text" weight="duotone" aria-hidden />
      </div>
      <h2 className="text-2xl font-bold">No pudimos cargar esta sección</h2>
      <p className="max-w-md text-muted-foreground">
        Reintenta; si sigue pasando, avísanos
        {error.digest ? (
          <>
            {" "}
            con este código: <span className="font-mono text-foreground">{error.digest}</span>
          </>
        ) : (
          "."
        )}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button onClick={reintentar} disabled={reintentando} aria-busy={reintentando || undefined}>
          {reintentando && <SpinnerIcon className="animate-spin" aria-hidden />}
          {reintentando ? "Reintentando…" : "Reintentar"}
        </Button>
        <Link href="/admin/dashboard" className={buttonVariants({ variant: "outline" })}>
          Volver al resumen
        </Link>
      </div>
    </div>
  );
}
