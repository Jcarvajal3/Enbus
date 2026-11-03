"use client";

// ─── Tasa BCV en el cliente ─────────────────────────────────────────────────
// El layout del panel lee la tasa en el servidor (lib/tasa-bcv) y la pasa aquí.
// El provider la refresca cada 30 min (la taquilla pasa el día abierta) y
// `useTasaBCV()` la expone a <Monto> y a cualquier componente de cliente.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatNumeroVE, fechaTasaCorta } from "@/lib/dinero";
import { esTasaDesactualizada, filaATasaBCV, type TasaBCV } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";

// En Server Components importa `esTasaDesactualizada` desde lib/types/pagos
// (este módulo es "use client" y sus funciones no se pueden llamar en el servidor).
export { esTasaDesactualizada };

const REFRESCO_MS = 30 * 60 * 1000;

const TasaBCVContext = createContext<TasaBCV | null>(null);

export function TasaBCVProvider({
  tasaInicial,
  children,
}: {
  tasaInicial: TasaBCV | null;
  children: ReactNode;
}) {
  const [tasa, setTasa] = useState<TasaBCV | null>(tasaInicial);
  // Si el servidor vuelve a renderizar el layout (revalidatePath / refresh), manda su valor.
  const [inicialPrevia, setInicialPrevia] = useState(tasaInicial);
  if (tasaInicial !== inicialPrevia) {
    setInicialPrevia(tasaInicial);
    setTasa(tasaInicial);
  }

  useEffect(() => {
    let activo = true;
    const refrescar = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { data, error } = await createClient().rpc("fn_tasa_bcv_vigente").maybeSingle();
      if (!activo || error) return; // si falla, se conserva la última conocida
      const nueva = filaATasaBCV(data as Parameters<typeof filaATasaBCV>[0]);
      if (nueva) setTasa(nueva);
    };
    const id = window.setInterval(refrescar, REFRESCO_MS);
    return () => {
      activo = false;
      window.clearInterval(id);
    };
  }, []);

  return <TasaBCVContext.Provider value={tasa}>{children}</TasaBCVContext.Provider>;
}

/** Tasa BCV vigente o null (sin tasa registrada o fuera del panel de cooperativas). */
export function useTasaBCV(): TasaBCV | null {
  return useContext(TasaBCVContext);
}

/** Chip con la tasa del día: "BCV 02/10: 100,81 Bs/USD" (ámbar si está desactualizada). */
export function TasaBCVChip({ className }: { className?: string }) {
  const tasa = useTasaBCV();
  const desactualizada = esTasaDesactualizada(tasa);

  const texto = !tasa
    ? "Sin tasa BCV registrada"
    : desactualizada
      ? `Tasa BCV del ${fechaTasaCorta(tasa.fecha)} (sin actualizar)`
      : `BCV ${fechaTasaCorta(tasa.fecha)}: ${formatNumeroVE(tasa.tasa)} Bs/USD`;

  const ayuda = !tasa
    ? "No se pueden cobrar montos en bolívares hasta que el administrador de EnBus cargue la tasa BCV."
    : desactualizada
      ? `Se está usando la tasa del ${fechaTasaCorta(tasa.fecha)}: ${formatNumeroVE(tasa.tasa)} Bs/USD. Avísale al administrador de EnBus.`
      : `Tasa oficial BCV del ${fechaTasaCorta(tasa.fecha)}. Los precios en USD se cobran en bolívares a esta tasa.`;

  return (
    <span
      role="status"
      title={ayuda}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums whitespace-nowrap",
        desactualizada
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-border bg-muted/50 text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", desactualizada ? "bg-amber-500" : "bg-emerald-500")}
      />
      {texto}
      <span className="sr-only">. {ayuda}</span>
    </span>
  );
}
