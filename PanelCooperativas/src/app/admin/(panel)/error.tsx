"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WarningCircle } from "@phosphor-icons/react";

export default function AdminPanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 h-full text-white">
      <div className="bg-destructive/10 p-4 rounded-full">
        <WarningCircle size={48} className="text-red-500" weight="duotone" />
      </div>
      <h2 className="text-2xl font-bold">Algo salió mal</h2>
      <p className="text-slate-400 text-center max-w-md">
        {process.env.NODE_ENV === "development"
          ? (error.message || "Ha ocurrido un error inesperado.")
          : "Ha ocurrido un error inesperado al cargar esta página. Por favor, inténtelo de nuevo o contacte al soporte técnico."}
      </p>
      <div className="flex gap-4 mt-4">
        <Button onClick={reset} className="bg-orange-600 hover:bg-orange-700 text-white">
          Reintentar
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline" className="border-slate-800 text-white hover:bg-slate-800">
          Recargar Página
        </Button>
      </div>
    </div>
  );
}
