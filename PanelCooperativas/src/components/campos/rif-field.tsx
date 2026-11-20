"use client";

import { Input } from "@/components/ui/input";
import { normalizeRif, RIF_AYUDA_CORTA, RIF_PLACEHOLDER } from "@/lib/rif";
import type { ReactNode } from "react";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";

export interface RifFieldProps extends Omit<PropsCampoComun, "label" | "ayuda"> {
  /** "RIF" por defecto. */
  label?: string;
  /** Lo escrito en mayúsculas; al salir del campo, si es válido, pasa a "J-12345678-9". */
  value: string;
  onChange(valor: string): void;
  onBlur?(): void;
  /** Por defecto "Letra y 9 números, con o sin guiones."; `null` la quita. */
  ayuda?: ReactNode | null;
}

/** RIF: texto en mayúsculas que se normaliza ("j123456789" → "J-12345678-9") al salir del campo. */
export function RifField({
  id,
  label = "RIF",
  value,
  onChange,
  onBlur,
  error,
  ayuda,
  opcional,
  disabled,
  name,
  enterKeyHint,
  autoFocus,
  required,
  className,
}: RifFieldProps) {
  const ayudaFinal = ayuda === undefined ? RIF_AYUDA_CORTA : ayuda;
  const { describedBy, invalido } = idsCampo(id, error, ayudaFinal);

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayudaFinal}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={normalizeRif(value) ?? value} /> : undefined}
    >
      <Input
        id={id}
        type="text"
        inputMode="text"
        enterKeyHint={enterKeyHint}
        autoComplete="off"
        autoCapitalize="characters"
        autoFocus={autoFocus}
        spellCheck={false}
        maxLength={20}
        placeholder={`Ej. ${RIF_PLACEHOLDER}`}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onBlur={() => {
          const normalizado = normalizeRif(value);
          if (normalizado && normalizado !== value) onChange(normalizado);
          onBlur?.();
        }}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={invalido}
        aria-describedby={describedBy}
        className="tabular-nums"
      />
    </CampoContenedor>
  );
}
