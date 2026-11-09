"use client";

// ─── Día de salida (venta en taquilla) ──────────────────────────────────────
// Atajos "Hoy" y "Mañana" (control segmentado, D19) y un campo de fecha para
// cualquier otro día. Los días son 'YYYY-MM-DD' en hora de Venezuela (UTC-4):
// nunca se usa la zona del navegador. No se venden boletos de días pasados.

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDiaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // El campo lleva su propio texto: al teclear la fecha por partes pasa por días
  // incompletos o pasados que no se aplican (y no deben borrar lo tecleado).
  const [texto, setTexto] = useState(dia ?? "");
  const [diaPrevio, setDiaPrevio] = useState(dia);
  if (dia !== diaPrevio) {
    setDiaPrevio(dia);
    setTexto(dia ?? "");
  }

  return (
    <div role="group" aria-labelledby={`${id}-etiqueta`} className={cn("flex flex-col gap-2", className)}>
      <span id={`${id}-etiqueta`} className="text-sm leading-none font-medium text-foreground select-none">
        Día de salida
      </span>
      <div className="flex flex-wrap items-center gap-2">
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
        <Label htmlFor={`${id}-fecha`} className="sr-only">
          Otra fecha
        </Label>
        <Input
          id={`${id}-fecha`}
          type="date"
          min={hoy}
          value={texto}
          disabled={disabled}
          aria-invalid={texto !== "" && FECHA_RE.test(texto) && texto < hoy ? true : undefined}
          onChange={(e) => {
            const valor = e.target.value;
            setTexto(valor);
            if (FECHA_RE.test(valor) && valor >= hoy) onCambio(valor);
          }}
          // Al salir con una fecha incompleta o pasada, vuelve al día elegido.
          onBlur={() => setTexto(dia ?? "")}
          className="h-9 w-auto min-w-0 flex-1 text-sm tabular-nums sm:w-44 sm:flex-none md:text-sm"
        />
      </div>
    </div>
  );
}
