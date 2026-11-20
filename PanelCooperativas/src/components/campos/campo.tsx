"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CampoContenedor, CLASE_ADORNO, idsCampo, type PropsCampoComun } from "./campo-base";

export interface CampoProps extends PropsCampoComun {
  value: string;
  onChange(valor: string): void;
  onBlur?(): void;
  type?: "text" | "email" | "url" | "search" | "password";
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  /** Sugerencia del navegador: "off" por defecto (usar "name", "email"… solo si es un dato de quien usa el panel). */
  autoComplete?: string;
  maxLength?: number;
  /** Pasa a mayúsculas mientras se escribe. */
  mayusculas?: boolean;
  /**
   * Teclado móvil: "words" para nombres de persona, "none" para correos y códigos. Por defecto
   * "none" si `type="email"`; `mayusculas` lo fuerza a "characters".
   */
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  /** Adorno dentro del campo, a la izquierda ("Bs", "$"). */
  prefijo?: ReactNode;
  /** Adorno dentro del campo, a la derecha ("kg", "USD"). */
  sufijo?: ReactNode;
  spellCheck?: boolean;
}

/** Campo de texto genérico: etiqueta, ayuda o error, y el mismo aspecto que los demás campos. */
export function Campo({
  id,
  label,
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
  type = "text",
  inputMode,
  placeholder,
  autoComplete = "off",
  maxLength,
  mayusculas,
  autoCapitalize,
  prefijo,
  sufijo,
  spellCheck,
}: CampoProps) {
  const capitalizar = mayusculas ? "characters" : (autoCapitalize ?? (type === "email" ? "none" : undefined));
  const { describedBy, invalido } = idsCampo(id, error, ayuda);

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={value} /> : undefined}
    >
      <div className="relative">
        {prefijo && (
          <span className={cn(CLASE_ADORNO, "left-4")} aria-hidden>
            {prefijo}
          </span>
        )}
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          enterKeyHint={enterKeyHint}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize={capitalizar}
          spellCheck={spellCheck ?? (type === "text" ? undefined : false)}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(mayusculas ? e.target.value.toUpperCase() : e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={invalido}
          aria-describedby={describedBy}
          className={cn(prefijo ? "pl-11" : undefined, sufijo ? "pr-12" : undefined, mayusculas && "uppercase")}
        />
        {sufijo && (
          <span className={cn(CLASE_ADORNO, "right-4")} aria-hidden>
            {sufijo}
          </span>
        )}
      </div>
    </CampoContenedor>
  );
}
