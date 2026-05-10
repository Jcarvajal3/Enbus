"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WarningCircle } from "@phosphor-icons/react";

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 h-full">
      <div className="bg-destructive/10 p-4 rounded-full">
        <WarningCircle size={48} className="text-destructive" weight="duotone" />
      </div>
      <h2 className="text-2xl font-bold">Algo salió mal</h2>
      <p className="text-muted-foreground text-center max-w-md">
        {error.message || "Ha ocurrido un error inesperado al intentar cargar esta página."}
      </p>
      <div className="flex gap-4 mt-4">
        <Button onClick={reset} variant="default">
          Reintentar
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Recargar Página
        </Button>
      </div>
    </div>
  );
}
