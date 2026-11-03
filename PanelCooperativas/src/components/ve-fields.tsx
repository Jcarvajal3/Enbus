"use client";

// ─── Campos venezolanos para la web (#57, PC-04, DS-06) ──────────────────────
// CedulaField: letra (V, E, J, G, P) + número con puntos mientras se escribe.
// TelefonoField: un campo con la máscara "0414-123.45.67" en vivo; acepta
// "+58 414 1234567", "58…", "414…".
// Ambos: label asociado, aria-invalid / aria-describedby con el error y, si se
// pasa `name`, un <input type="hidden"> con la forma en que se guarda
// ("V-12345678", "0414-1234567") para formularios con server actions.
// Reglas de lib/ve.ts (las mismas de la base y la app).

import { useLayoutEffect, useRef, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CEDULA_PLACEHOLDER,
  TELEFONO_PLACEHOLDER,
  cedulaParaGuardar,
  telefonoParaGuardar,
  telefonoValido,
} from "@/lib/ve";
import { cn } from "@/lib/utils";

type LetraCedula = "V" | "E" | "J" | "G" | "P";

const LETRAS_VALIDAS = /^[VEJGPC]$/;
const MAX_DIGITOS_CEDULA = 10;

// ─── Utilidades de máscara ───────────────────────────────────────────────────

/** Cuántos dígitos hay antes de la posición `pos` de `texto`. */
function digitosAntes(texto: string, pos: number) {
  return texto.slice(0, pos).replace(/\D/g, "").length;
}

/** Posición en `texto` justo después del dígito número `n` (0 → inicio). */
function posicionTrasDigitos(texto: string, n: number) {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) {
      vistos++;
      if (vistos === n) return i + 1;
    }
  }
  return texto.length;
}

/**
 * Conserva el cursor en el mismo dígito cuando la máscara cambia el texto
 * (insertar puntos o guiones no lo manda al final).
 */
function useCursorEnDigito(valorMostrado: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digitosRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const n = digitosRef.current;
    digitosRef.current = null;
    if (!el || n === null || document.activeElement !== el) return;
    const pos = posicionTrasDigitos(el.value, n);
    el.setSelectionRange(pos, pos);
  }, [valorMostrado]);

  /** Llamar en onChange, antes de emitir el valor nuevo. */
  const recordar = (e: ChangeEvent<HTMLInputElement>) => {
    const pos = e.target.selectionStart;
    // Al final del texto no hace falta: el navegador ya deja el cursor al final.
    digitosRef.current = pos === null || pos >= e.target.value.length ? null : digitosAntes(e.target.value, pos);
  };

  return { inputRef, recordar };
}

/** "12345678" → "12.345.678". */
function agruparMiles(digitos: string) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Separa "v-12.345.678" en { letra: "V", numero: "12345678" }; sin letra → la por defecto. */
function separarCedula(v: string | null | undefined, porDefecto: string): { letra: string; numero: string } {
  const texto = (v ?? "").trim().toUpperCase();
  if (texto.startsWith("PENDIENTE")) return { letra: porDefecto, numero: "" };
  const limpio = texto.replace(/[^A-Z0-9]/g, "");
  const primera = limpio.charAt(0);
  const letra = LETRAS_VALIDAS.test(primera) ? primera : porDefecto;
  return { letra, numero: limpio.replace(/\D/g, "").slice(0, MAX_DIGITOS_CEDULA) };
}

/**
 * Máscara progresiva del teléfono: "0414" → "0414-", "04141234" → "0414-123.4",
 * "+58 414 1234567" → "0414-123.45.67"; nunca más de 11 dígitos.
 */
function mascaraTelefono(entrada: string): string {
  if (entrada.trim().toUpperCase().startsWith("PENDIENTE")) return "";
  let d = entrada.replace(/\D/g, "");
  // Código de país ("+58…" o "58…"): ningún número local empieza por 5 (son 02xx y 04xx).
  if (entrada.trim().startsWith("+") || d.startsWith("5")) {
    if (d.length <= 2) return d ? `+${d}` : entrada.trim().startsWith("+") ? "+" : "";
    if (d.startsWith("58")) d = d.slice(2);
  }
  if (d && d[0] !== "0") d = `0${d}`;
  d = d.slice(0, 11);
  let r = d.slice(0, 4);
  if (d.length >= 4) r += "-";
  r += d.slice(4, 7);
  if (d.length >= 7) r += ".";
  r += d.slice(7, 9);
  if (d.length >= 9) r += ".";
  r += d.slice(9, 11);
  return d.length === 11 ? r.replace(/[-.]$/, "") : r;
}

/**
 * Texto del campo para un `value`: si ya viene con la máscara (lo que emitió el
 * propio campo, con o sin el separador final) se respeta tal cual; si no
 * ("0414-1234567" guardado, "+58 414…"), se le aplica la máscara.
 */
function telefonoMostrado(value: string): string {
  const conMascara = mascaraTelefono(value);
  return value === conMascara.replace(/[-.]$/, "") ? value : conMascara;
}

// ─── Piezas comunes ──────────────────────────────────────────────────────────

function MensajeError({ id, error }: { id: string; error?: string | null }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive-text">
      {error}
    </p>
  );
}

// ─── CedulaField ─────────────────────────────────────────────────────────────

export function CedulaField({
  id,
  name,
  label = "Cédula",
  value,
  onChange,
  error,
  letras = ["V", "E"],
  required,
  disabled,
}: {
  id: string;
  name?: string;
  label?: string;
  value: string;
  onChange(v: string): void;
  error?: string | null;
  letras?: Array<LetraCedula>;
  required?: boolean;
  disabled?: boolean;
}) {
  const porDefecto = letras[0] ?? "V";
  const { letra, numero } = separarCedula(value, porDefecto);
  // Una cédula guardada con otra letra (p. ej. J) no se pierde aunque no esté en `letras`.
  const opciones: string[] = letras.includes(letra as LetraCedula) ? letras : [...letras, letra];
  const mostrado = agruparMiles(numero);
  const { inputRef, recordar } = useCursorEnDigito(mostrado);
  const errorId = `${id}-error`;
  const ayudaId = `${id}-ayuda`;

  /** "V-12345678" si es válida; si no, lo escrito ("V-123") para que se pueda seguir corrigiendo. */
  const emitir = (l: string, n: string) => {
    if (!n) return onChange("");
    onChange(cedulaParaGuardar(`${l}${n}`) ?? `${l}-${n}`);
  };

  const alEscribir = (e: ChangeEvent<HTMLInputElement>) => {
    recordar(e);
    const crudo = e.target.value;
    // Pegar "v-12.345.678" o "E12345678": la letra también se toma.
    const pegada = crudo.trim().toUpperCase().charAt(0);
    const l = LETRAS_VALIDAS.test(pegada) ? pegada : letra;
    emitir(l, crudo.replace(/\D/g, "").slice(0, MAX_DIGITOS_CEDULA));
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <select
          id={`${id}-letra`}
          aria-label={`${label}: letra`}
          value={letra}
          disabled={disabled}
          onChange={(e) => emitir(e.target.value, numero)}
          className={cn(
            "h-9 shrink-0 rounded-4xl border border-input bg-input/30 px-3 text-base font-medium outline-none transition-colors md:text-sm",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {opciones.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <Input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={agruparMiles(CEDULA_PLACEHOLDER.replace(/\D/g, ""))}
          value={mostrado}
          onChange={alEscribir}
          required={required}
          aria-required={required || undefined}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : ayudaId}
          className="tabular-nums"
        />
      </div>
      {error ? (
        <MensajeError id={errorId} error={error} />
      ) : (
        <p id={ayudaId} className="text-xs text-muted-foreground">
          Elige la letra y escribe solo los números. Ejemplo: {CEDULA_PLACEHOLDER}.
        </p>
      )}
      {name && <input type="hidden" name={name} value={value ? cedulaParaGuardar(value) ?? value : ""} />}
    </div>
  );
}

// ─── TelefonoField ───────────────────────────────────────────────────────────

export function TelefonoField({
  id,
  name,
  label = "Teléfono",
  value,
  onChange,
  error,
  required,
  disabled,
}: {
  id: string;
  name?: string;
  label?: string;
  value: string;
  onChange(v: string): void;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
}) {
  const mostrado = telefonoMostrado(value);
  const { inputRef, recordar } = useCursorEnDigito(mostrado);
  const errorId = `${id}-error`;
  const ayudaId = `${id}-ayuda`;

  const alEscribir = (e: ChangeEvent<HTMLInputElement>) => {
    recordar(e);
    let enmascarado = mascaraTelefono(e.target.value);
    // Al borrar, no volver a poner el separador final (si no, el guion no se puede borrar).
    const tipo = (e.nativeEvent as InputEvent).inputType ?? "";
    if (tipo.startsWith("delete")) enmascarado = enmascarado.replace(/[-.]$/, "");
    // Completo y válido → la forma de guardar ("0414-1234567"); si no, lo escrito con la máscara.
    onChange(telefonoValido(enmascarado) ? telefonoParaGuardar(enmascarado) ?? enmascarado : enmascarado);
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder={TELEFONO_PLACEHOLDER}
        value={mostrado}
        onChange={alEscribir}
        required={required}
        aria-required={required || undefined}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : ayudaId}
        className="tabular-nums"
      />
      {error ? (
        <MensajeError id={errorId} error={error} />
      ) : (
        <p id={ayudaId} className="text-xs text-muted-foreground">
          Móvil o fijo venezolano. Ejemplo: {TELEFONO_PLACEHOLDER}.
        </p>
      )}
      {name && <input type="hidden" name={name} value={value ? telefonoParaGuardar(value) ?? value : ""} />}
    </div>
  );
}

