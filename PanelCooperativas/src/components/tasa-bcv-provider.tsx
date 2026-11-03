"use client";

// ─── Tasa BCV en el cliente ─────────────────────────────────────────────────
// El layout del panel lee la tasa en el servidor (lib/tasa-bcv) y la pasa aquí.
// El provider la refresca cada 30 min (la taquilla pasa el día abierta) y
// `useTasaBCV()` la expone a <Monto> y a cualquier componente de cliente.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatNumeroVE, fechaTasaCorta } from "@/lib/dinero";
import { esTasaDesactualizada, filaATasaBCV, type TasaBCV } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

  const sinTasaDelServidor = useRef(!tasaInicial);

  useEffect(() => {
    let activo = true;
    const refrescar = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { data, error } = await createClient().rpc("fn_tasa_bcv_vigente").maybeSingle();
      if (!activo || error) return; // si falla, se conserva la última conocida
      const nueva = filaATasaBCV(data as Parameters<typeof filaATasaBCV>[0]);
      if (nueva) setTasa(nueva);
    };
    // Sin tasa del servidor (consulta fallida o sin tasa todavía): se pide ya desde el
    // navegador, sin esperar 30 min mostrando "Sin tasa BCV" cuando sí la hay.
    if (sinTasaDelServidor.current) void refrescar();
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

/**
 * Chip con la tasa del día en la barra superior: "BCV 02/10: 100,81 Bs/USD" y, en
 * teléfono, "BCV 100,81" (el texto completo queda en el `title`). Ámbar si está
 * desactualizada. Con `href` (admin) enlaza a donde se carga la tasa.
 */
export function TasaBCVChip({ className, href }: { className?: string; href?: string }) {
  const tasa = useTasaBCV();
  const desactualizada = esTasaDesactualizada(tasa);
  const aviso = !tasa || desactualizada;

  const texto = !tasa
    ? "Sin tasa BCV registrada"
    : desactualizada
      ? `Tasa BCV del ${fechaTasaCorta(tasa.fecha)} (sin actualizar)`
      : `BCV ${fechaTasaCorta(tasa.fecha)}: ${formatNumeroVE(tasa.tasa)} Bs/USD`;
  const corto = !tasa ? "Sin tasa BCV" : `BCV ${formatNumeroVE(tasa.tasa)}`;

  const ayuda = !tasa
    ? "No se pueden cobrar montos en bolívares hasta que el administrador de EnBus cargue la tasa BCV."
    : desactualizada
      ? `Se está usando la tasa del ${fechaTasaCorta(tasa.fecha)}: ${formatNumeroVE(tasa.tasa)} Bs/USD. Avísale al administrador de EnBus.`
      : `Tasa oficial BCV del ${fechaTasaCorta(tasa.fecha)}. Los precios en USD se cobran en bolívares a esta tasa.`;

  const clases = cn(
    "inline-flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums whitespace-nowrap",
    aviso ? "border-warning/40 bg-warning-light text-warning-deep" : "border-border bg-muted/50 text-muted-foreground",
    href &&
      cn(
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        aviso ? "hover:border-warning/70" : "hover:bg-muted hover:text-foreground"
      ),
    className
  );

  const contenido = (
    <>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", aviso ? "bg-warning" : "bg-success")} />
      <span aria-hidden className="sm:hidden">{corto}</span>
      <span aria-hidden className="hidden sm:inline">{texto}</span>
      <span className="sr-only">{`${texto}. ${ayuda}`}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} title={ayuda} className={clases}>
        {contenido}
      </Link>
    );
  }
  return (
    <span role="status" title={ayuda} className={clases}>
      {contenido}
    </span>
  );
}
