"use client";

import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  cedulaParaGuardar,
  CEDULA_PLACEHOLDER,
  editarCedulaNumero,
  LETRAS_PERSONA,
  mascaraCedulaNumero,
  separarCedula,
  type LetraCedula,
} from "@/lib/ve";
import { cn } from "@/lib/utils";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";
import { useCursorEnDigito } from "./use-cursor-en-digito";

const NOMBRE_LETRA: Record<LetraCedula, string> = {
  V: "Venezolano",
  E: "Extranjero",
  J: "Jurídico",
  G: "Gobierno",
  P: "Pasaporte",
  C: "Comunal",
};

/** ¿Empieza por una letra de documento ("v-12.345.678", "E123")? */
const EMPIEZA_CON_LETRA = /^\s*[VEJGPC]/i;

export interface CedulaFieldProps extends Omit<PropsCampoComun, "label"> {
  /** "Cédula" por defecto. */
  label?: string;
  /** "V-12345678" si es válida; si no, lo escrito ("V-123"); vacío sin número. */
  value: string;
  onChange(valor: string): void;
  onBlur?(): void;
  /**
   * Letras que se ofrecen, según el contexto: `LETRAS_PERSONA` (por defecto), `LETRAS_PASAJERO`,
   * `LETRAS_ENCOMIENDA`, `LETRAS_TITULAR` (de `@/lib/ve`). Una cédula guardada con otra letra
   * no se pierde: se añade como una opción más.
   */
  letras?: readonly LetraCedula[];
  /** "off" por defecto. */
  autoComplete?: string;
}

/**
 * Cédula como letra + número: la letra se elige con botones (grupo de opciones) y el número se
 * escribe con puntos de miles en vivo ("12.345.678"). Pegar "v-12.345.678" separa la letra del
 * número. Emite la forma que se guarda ("V-12345678"). Validar con `cedulaValida`.
 */
export function CedulaField({
  id,
  label = "Cédula",
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
  letras = LETRAS_PERSONA,
  autoComplete = "off",
}: CedulaFieldProps) {
  const separada = separarCedula(value);
  const tieneLetra = EMPIEZA_CON_LETRA.test(value ?? "") && !/^\s*pendiente/i.test(value ?? "");
  // Sin valor se recuerda la última letra elegida (si no, al borrar el número volvería a "V").
  const [letraElegida, setLetraElegida] = useState<LetraCedula>(letras[0] ?? "V");
  const letra: LetraCedula = tieneLetra ? separada.letra : letraElegida;
  const opciones: readonly LetraCedula[] = letras.includes(letra) ? letras : [...letras, letra];
  const mostrado = mascaraCedulaNumero(separada.numero);
  const { inputRef, recordar } = useCursorEnDigito();
  const { describedBy, invalido } = idsCampo(id, error, ayuda);

  /** "V-12345678" si es válida; si no, lo escrito ("V-123"); vacío sin número. */
  const emitir = (l: LetraCedula, numero: string) => {
    if (!numero) return onChange("");
    onChange(cedulaParaGuardar(`${l}${numero}`) ?? `${l}-${numero}`);
  };

  const elegir = (nueva: LetraCedula) => {
    if (disabled) return;
    setLetraElegida(nueva);
    emitir(nueva, separada.numero);
  };

  const alEscribir = (crudo: string) => {
    // Pegó o escribió la letra ("v-12.345.678", "E12345678"): se toma la letra y los dígitos.
    if (EMPIEZA_CON_LETRA.test(crudo)) {
      const pegada = separarCedula(crudo);
      setLetraElegida(pegada.letra);
      emitir(pegada.letra, pegada.numero);
      return;
    }
    emitir(letra, editarCedulaNumero(mostrado, crudo).replace(/\D/g, ""));
  };

  // Flechas, inicio y fin mueven la selección como en un grupo de radios nativo.
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = opciones.indexOf(letra);
    let destino = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") destino = (i + 1) % opciones.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") destino = (i - 1 + opciones.length) % opciones.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = opciones.length - 1;
    if (destino < 0) return;
    e.preventDefault();
    elegir(opciones[destino]);
    const botones = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    botones[destino]?.focus();
  };

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={cedulaParaGuardar(value) ?? value} /> : undefined}
    >
      <div className="flex flex-wrap items-start gap-2">
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- las teclas llegan desde el botón enfocado */}
        <div
          role="radiogroup"
          aria-label={`${label}: tipo de documento`}
          onKeyDown={alTeclear}
          className="flex gap-1.5"
        >
          {opciones.map((l) => {
            const elegida = l === letra;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={elegida}
                aria-label={`${NOMBRE_LETRA[l]} (${l})`}
                tabIndex={elegida ? 0 : -1}
                disabled={disabled}
                onClick={() => elegir(l)}
                className={cn(
                  "flex h-12 min-w-12 items-center justify-center rounded-md px-3 text-[15px] font-semibold transition-colors outline-none",
                  "focus-visible:ring-[3px] focus-visible:ring-accent-strong/30",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  elegida
                    ? "bg-accent-strong text-accent-strong-foreground"
                    : "bg-surface text-foreground hover:bg-surface-dark"
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
        <Input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          enterKeyHint={enterKeyHint}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={CEDULA_PLACEHOLDER}
          value={mostrado}
          onChange={(e) => {
            recordar(e);
            alEscribir(e.target.value);
          }}
          onBlur={onBlur}
          disabled={disabled}
          aria-label={`${label}, número (${NOMBRE_LETRA[letra]}, ${letra})`}
          aria-required={required || undefined}
          aria-invalid={invalido}
          aria-describedby={describedBy}
          className="min-w-36 flex-1 basis-36 tabular-nums"
        />
      </div>
    </CampoContenedor>
  );
}
