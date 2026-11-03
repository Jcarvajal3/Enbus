"use client";

import { useId } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatNumeroVE } from "@/lib/dinero";

// ─── Comisión de EnBus (%) (AD5-36) ─────────────────────────────────────────
// Un solo campo en "Nueva cooperativa", "Editar cooperativa" y "Aprobar
// solicitud": decimal con coma, y la ayuda dice lo que cobra EnBus por Bs 100.

/** "7,5" | "7.5" → 7.5; NaN si no es un número entre 0 y 100. */
export function leerComision(texto: string): number {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return NaN;
  const n = Number(limpio);
  return n >= 0 && n <= 100 ? n : NaN;
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
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Comisión de EnBus (%)</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="Ej. 10"
        value={valor}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ayuda`}
        onChange={(e) => onCambio(e.target.value)}
        className="tabular-nums"
      />
      {name && <input type="hidden" name={name} value={Number.isFinite(n) ? String(n) : valor} />}
      {error ? (
        <FieldError id={`${id}-ayuda`}>{error}</FieldError>
      ) : (
        <FieldDescription id={`${id}-ayuda`} aria-live="polite">
          {Number.isFinite(n)
            ? `Por cada Bs 100, EnBus recibe Bs ${formatNumeroVE(n)}.`
            : "Se cobra sobre cada boleto y encomienda vendidos."}
        </FieldDescription>
      )}
    </Field>
  );
}
