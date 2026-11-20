"use client";

import { Input } from "@/components/ui/input";
import {
  editarTelefono,
  mostrarTelefono,
  telefonoParaGuardar,
  TELEFONO_PLACEHOLDER,
} from "@/lib/ve";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";
import { useCursorEnDigito } from "./use-cursor-en-digito";

export interface TelefonoFieldProps extends Omit<PropsCampoComun, "label"> {
  /** "Teléfono" por defecto. */
  label?: string;
  /** Lo que emite el campo: "0414-1234567" si el número es válido; si no, lo escrito ("0414-123"). */
  value: string;
  onChange(valor: string): void;
  onBlur?(): void;
  /** "off" por defecto; "tel" solo si es el teléfono de quien usa el panel. */
  autoComplete?: string;
}

/**
 * Teléfono venezolano con la máscara en vivo de `shared` ("0414-123.45.67"). Acepta
 * "+58 414 1234567", "58…" y "414…" (escrito o pegado). Validar con `telefonoValido`.
 */
export function TelefonoField({
  id,
  label = "Teléfono",
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
  autoComplete = "off",
}: TelefonoFieldProps) {
  const mostrado = mostrarTelefono(value);
  const { inputRef, recordar } = useCursorEnDigito();
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
      ocultos={name ? <input type="hidden" name={name} value={telefonoParaGuardar(value) ?? value} /> : undefined}
    >
      <Input
        id={id}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        enterKeyHint={enterKeyHint}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        placeholder={TELEFONO_PLACEHOLDER}
        value={mostrado}
        onChange={(e) => {
          recordar(e);
          const visible = editarTelefono(mostrado, e.target.value);
          // Completo y válido → la forma de guardar ("0414-1234567"); si no, lo escrito con la máscara.
          onChange(telefonoParaGuardar(visible) ?? visible);
        }}
        onBlur={onBlur}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={invalido}
        aria-describedby={describedBy}
        className="tabular-nums"
      />
    </CampoContenedor>
  );
}
