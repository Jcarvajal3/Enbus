"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { avisarInfo } from "@/lib/avisos";

/** Botón "Copiar" para un código (tracking, PIN, código de boleto). */
export function CopiarTexto({ texto, etiqueta, className = "s-boton s-boton--claro s-boton--sm" }: { texto: string; etiqueta: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      avisarInfo("No pudimos copiarlo. Anótalo o selecciónalo con el dedo.");
    }
  };

  return (
    <button type="button" className={className} onClick={copiar} aria-label={copiado ? `${etiqueta} copiado` : `Copiar ${etiqueta}`}>
      {copiado ? <Check aria-hidden weight="bold" /> : <Copy aria-hidden />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}
