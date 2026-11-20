"use client";

import { Input } from "@/components/ui/input";
import { editarMonto, formatNumeroVE, leerMonto, MONTO_PLACEHOLDER } from "@/lib/dinero";
import { cn } from "@/lib/utils";
import { CampoContenedor, CLASE_ADORNO, idsCampo, type PropsCampoComun } from "./campo-base";
import { useCursorEnDigito } from "./use-cursor-en-digito";

export interface MontoFieldProps extends Omit<PropsCampoComun, "label"> {
  /** "Monto" por defecto. */
  label?: string;
  /** Texto con la máscara "1.250,50" (el campo conserva lo escrito a medias: "12,"). Leer con `leerMonto`. */
  value: string;
  onChange(texto: string): void;
  onBlur?(): void;
  moneda: "Bs" | "USD";
  /** Acepta 0 (por defecto no: un monto de cero es inválido). */
  permitirCero?: boolean;
  /** Cifras decimales admitidas (2 por defecto; p. ej. 4 para la tasa BCV). Leer con `leerMonto(value, { decimales })`. */
  decimales?: number;
  placeholder?: string;
}

/**
 * Monto con coma decimal y puntos de miles en vivo ("1.250,50"), máx. 2 decimales. Al salir del
 * campo completa los decimales ("12,5" → "12,50"). El valor numérico es `leerMonto(value)`;
 * con `name`, el input oculto lleva ese número ("1250.5").
 */
export function MontoField({
  id,
  label = "Monto",
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
  moneda,
  permitirCero,
  decimales = 2,
  placeholder = MONTO_PLACEHOLDER,
}: MontoFieldProps) {
  const { inputRef, recordar } = useCursorEnDigito();
  const { describedBy, invalido } = idsCampo(id, error, ayuda);
  const numero = leerMonto(value, { permitirCero, decimales });
  // Al salir se completan al menos 2 decimales, sin recortar los que se escribieron ("36,4567").
  const escritos = value.includes(",") ? value.slice(value.indexOf(",") + 1).length : 0;
  const decimalesAlSalir = Math.min(decimales, Math.max(2, escritos));

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={numero === null ? value : String(numero)} /> : undefined}
    >
      <div className="relative">
        <span className={cn(CLASE_ADORNO, "left-4")} aria-hidden>
          {moneda}
        </span>
        <Input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint={enterKeyHint}
          autoComplete="off"
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            recordar(e);
            onChange(editarMonto(value, e.target.value, decimales));
          }}
          onBlur={() => {
            if (numero !== null && value.trim() !== "") {
              const completo = formatNumeroVE(numero, decimalesAlSalir);
              if (completo !== value) onChange(completo);
            }
            onBlur?.();
          }}
          disabled={disabled}
          aria-label={`${label}${opcional ? " (opcional)" : ""} en ${moneda === "Bs" ? "bolívares" : "dólares"}`}
          aria-required={required || undefined}
          aria-invalid={invalido}
          aria-describedby={describedBy}
          className={cn("tabular-nums", moneda === "Bs" ? "pl-12" : "pl-14")}
        />
      </div>
    </CampoContenedor>
  );
}
