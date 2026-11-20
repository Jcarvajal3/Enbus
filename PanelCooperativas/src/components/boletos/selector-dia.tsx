"use client";

// ─── Día de salida (venta en taquilla) ──────────────────────────────────────
// Atajos "Hoy" y "Mañana" (control segmentado, D19) y un `FechaField` (calendario
// propio) para cualquier otro día. Los días son 'YYYY-MM-DD' en hora de Venezuela
// (UTC-4): nunca se usa la zona del navegador. No se venden boletos de días pasados.

import { useId } from "react";
import { FechaField } from "@/components/campos";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDiaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/** "Hoy", "Mañana" o "jue. 12 nov." para un día 'YYYY-MM-DD'. */
export function nombreDia(dia: string) {
  const hoy = hoyVE();
  if (dia === hoy) return "Hoy";
  if (dia === sumarDiasVE(hoy, 1)) return "Mañana";
  return formatDiaVE(dia);
}

/** El día dentro de una frase: "hoy", "mañana" o "el jue. 12 nov.". */
export function diaEnFrase(dia: string) {
  const nombre = nombreDia(dia);
  return nombre === "Hoy" || nombre === "Mañana" ? nombre.toLowerCase() : `el ${nombre}`;
}

export function SelectorDia({
  dia,
  onCambio,
  disabled = false,
  className,
}: {
  /** Día elegido ('YYYY-MM-DD'); null mientras se decide el día inicial. */
  dia: string | null;
  onCambio: (dia: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const hoy = hoyVE();
  const manana = sumarDiasVE(hoy, 1);
  // Con otro día elegido, ninguno de los atajos queda activo.
  const atajo = dia === hoy ? "hoy" : dia === manana ? "manana" : null;

  return (
    <div role="group" aria-labelledby={`${id}-etiqueta`} className={cn("flex flex-col gap-2", className)}>
      <span id={`${id}-etiqueta`} className="text-[13px] leading-none font-medium text-foreground select-none">
        Día de salida
      </span>
      <div className="flex flex-wrap items-start gap-2">
        <Tabs value={atajo} onValueChange={(v) => onCambio(v === "manana" ? manana : hoy)}>
          <TabsList aria-label="Atajos de día">
            <TabsTrigger value="hoy" disabled={disabled} className="flex-none px-4">
              Hoy
            </TabsTrigger>
            <TabsTrigger value="manana" disabled={disabled} className="flex-none px-4">
              Mañana
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {/* No se venden salidas pasadas: el calendario arranca hoy. */}
        <FechaField
          id={`${id}-fecha`}
          label="Otra fecha"
          value={dia ?? ""}
          onChange={onCambio}
          min={hoy}
          disabled={disabled}
          atajos={false}
          placeholder="Otra fecha"
          titulo="Día de salida"
          className="w-full min-w-0 flex-1 md:w-56 md:flex-none [&_label]:sr-only"
        />
      </div>
    </div>
  );
}
