"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Pestañas de Configuración en la URL (?tab=, PN-08, PN-32) ───────────────
// Orden de la puesta en marcha: Sucursales · Métodos de pago · Datos. Cambiar de
// pestaña reescribe `?tab=` con la History API (Next la sincroniza con
// useSearchParams), sin volver a pedir la página al servidor.

export const PESTANAS = ["sucursales", "metodos-pago", "datos"] as const;
export type Pestana = (typeof PESTANAS)[number];

const CORTAS: Partial<Record<Pestana, string>> = { "metodos-pago": "Pagos" };

const ETIQUETAS: Record<Pestana, string> = {
  sucursales: "Sucursales",
  "metodos-pago": "Métodos de pago",
  datos: "Datos",
};

export function PestanasConfiguracion({ defecto, paneles }: { defecto: Pestana; paneles: Record<Pestana, ReactNode> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pedida = searchParams.get("tab");
  const activa = (PESTANAS as readonly string[]).includes(pedida ?? "") ? (pedida as Pestana) : defecto;

  const cambiar = (valor: unknown) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor === defecto) params.delete("tab");
    else params.set("tab", String(valor));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Tabs value={activa} onValueChange={cambiar} className="flex flex-col gap-5 md:gap-8">
      <TabsList className="w-full md:w-fit" aria-label="Secciones de configuración">
        {PESTANAS.map((p) => (
          <TabsTrigger key={p} value={p} className="h-11 px-2 md:h-9 md:flex-none md:px-4">
            {CORTAS[p] ? (
              <>
                <span className="md:hidden">{CORTAS[p]}</span>
                <span className="hidden md:inline">{ETIQUETAS[p]}</span>
              </>
            ) : (
              ETIQUETAS[p]
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {PESTANAS.map((p) => (
        <TabsContent key={p} value={p}>
          {paneles[p]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
