"use client";

import { useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "14:30" → "2:30 p. m." (el mismo texto que `formatHoraVE`). */
export function hora12(hhmm: string): string {
  const m = HORA_RE.exec(hhmm);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "a. m." : "p. m."}`;
}

const suscribirNada = () => () => {};

/** ¿El navegador muestra la hora en 24 h? Solo se sabe en el cliente; en el servidor, no. */
function navegadoraMuestra24h(): boolean {
  const muestra = new Date(2020, 0, 1, 13, 0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return !/[ap]\.?\s?m/i.test(muestra);
}

export interface HoraFieldProps extends PropsCampoComun {
  /** 'HH:mm' en 24 h (como se guarda) o "". */
  value: string;
  onChange(hora: string): void;
  onBlur?(): void;
  min?: string;
  max?: string;
  /** Salto de los minutos, en segundos (por defecto 60). */
  paso?: number;
}

/**
 * Hora sobre el `<input type="time">` nativo (buen selector en móvil y teclado completo). Guarda
 * 'HH:mm'. Si el navegador la muestra en 24 h, debajo se lee en 12 h ("2:30 p. m.") como en
 * el resto del panel.
 */
export function HoraField({
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
  min,
  max,
  paso = 60,
}: HoraFieldProps) {
  const navegador24h = useSyncExternalStore(suscribirNada, navegadoraMuestra24h, () => false);

  const lectura = navegador24h && HORA_RE.test(value) ? hora12(value) : "";
  const ayudaFinal = ayuda ?? (lectura || undefined);
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
      ocultos={name ? <input type="hidden" name={name} value={value} /> : undefined}
    >
      <Input
        id={id}
        type="time"
        enterKeyHint={enterKeyHint}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={paso}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
