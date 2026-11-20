"use client";

// Conserva el cursor en el mismo dígito cuando una máscara cambia el texto del campo
// (al insertar puntos o guiones, el navegador lo mandaría al final). Se cuentan dígitos y no
// posiciones: "0414-123.45.67" y "04141234567" tienen los mismos dígitos en el mismo orden.

import { useLayoutEffect, useRef, type ChangeEvent } from "react";

/** Cuántos dígitos hay antes de la posición `pos` de `texto`. */
function digitosAntes(texto: string, pos: number) {
  return texto.slice(0, pos).replace(/\D/g, "").length;
}

/** Posición en `texto` justo después del dígito número `n` (0 → inicio). */
function posicionTrasDigitos(texto: string, n: number) {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (texto.charAt(i) >= "0" && texto.charAt(i) <= "9") {
      vistos++;
      if (vistos === n) return i + 1;
    }
  }
  return texto.length;
}

/**
 * `inputRef` va al `<input>`; `recordar(e)` se llama en `onChange`, antes de emitir el valor
 * nuevo; tras el render el cursor vuelve a su dígito. Al final del texto no hace nada (el
 * navegador ya deja el cursor ahí).
 */
export function useCursorEnDigito() {
  const inputRef = useRef<HTMLInputElement>(null);
  const digitosRef = useRef<number | null>(null);

  // Sin lista de dependencias: si la máscara deja el mismo texto, también hay que reponer el cursor.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const n = digitosRef.current;
    digitosRef.current = null;
    if (!el || n === null || typeof document === "undefined" || document.activeElement !== el) return;
    const pos = posicionTrasDigitos(el.value, n);
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // Algunos tipos de input (p. ej. "email", "number") no admiten selección.
    }
  });

  const recordar = (e: ChangeEvent<HTMLInputElement>) => {
    const pos = e.target.selectionStart;
    digitosRef.current = pos === null || pos >= e.target.value.length ? null : digitosAntes(e.target.value, pos);
  };

  return { inputRef, recordar };
}
