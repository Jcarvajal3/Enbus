"use client";

import { useId } from "react";
import { Campo } from "@/components/campos";
import { formatNumeroVE, leerMonto } from "@/lib/dinero";

// ─── Comisión de EnBus (%) (AD5-36) ─────────────────────────────────────────
// Un solo campo en "Nueva cooperativa", "Editar cooperativa" y "Aprobar
// solicitud": decimal con coma, y la ayuda dice lo que cobra EnBus por Bs 100.

/** "7,5" | "7.5" → 7.5; NaN si no es un número entre 0 y 100. */
export function leerComision(texto: string): number {
  const n = leerMonto(texto, { permitirCero: true });
  return n !== null && n <= 100 ? n : NaN;
}

/** 7.5 → "7,5" para precargar el campo. */
export function comisionATexto(n: number | string | null | undefined): string {
  const v = Number(n);
  return n === null || n === undefined || !Number.isFinite(v) ? "" : String(v).replace(".", ",");
}

export const ERROR_COMISION = "Escribe una comisión entre 0 y 100 %.";

export function CampoComision({
  valor,
  onCambio,
  error,
  disabled,
  name,
  autoFocus,
}: {
  valor: string;
  onCambio(v: string): void;
  error?: string | null;
  disabled?: boolean;
  /** Con `name`, el valor viaja en el formulario ya normalizado (punto decimal). */
  name?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const n = leerComision(valor);
  return (
    <>
      <Campo
        id={id}
        label="Comisión de EnBus (%)"
        value={valor}
        onChange={onCambio}
        inputMode="decimal"
        placeholder="Ej. 10"
        sufijo="%"
        maxLength={6}
        autoFocus={autoFocus}
        disabled={disabled}
        error={error}
        ayuda={
          Number.isFinite(n)
            ? `Por cada Bs 100, EnBus recibe Bs ${formatNumeroVE(n)}.`
            : "Se cobra sobre cada boleto y encomienda vendidos."
        }
      />
      {name && <input type="hidden" name={name} value={Number.isFinite(n) ? String(n) : valor} />}
    </>
  );
}
