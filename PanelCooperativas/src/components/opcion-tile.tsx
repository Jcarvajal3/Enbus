"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CheckCircle, type Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ─── Elegir una opción entre varias (PU-16, D1) ─────────────────────────────
// Método de pago, viaje, modalidad… Mosaico `rounded-md p-4`; elegido = borde y
// anillo `accent-strong`, fondo `accent-light` y `CheckCircle` fill (el color
// nunca es la única señal). Tocar selecciona; el botón del diálogo avanza.
//
//   <GrupoOpciones etiqueta="Método de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
//     <OpcionTile seleccionado={m === "EFECTIVO"} onSelect={() => setM("EFECTIVO")} icono={Money} titulo="Efectivo" />
//   </GrupoOpciones>

const SELECTOR_RADIO = '[role="radio"]';

/** Grupo con una sola parada de tabulación; flechas para moverse y elegir (como un radio nativo). */
export function GrupoOpciones({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Tabulación itinerante: entra por la opción elegida (o la primera habilitada).
  useEffect(() => {
    const grupo = ref.current;
    if (!grupo) return;
    const ordenar = () => {
      const radios = Array.from(grupo.querySelectorAll<HTMLElement>(SELECTOR_RADIO));
      const habilitados = radios.filter((r) => !r.hasAttribute("disabled"));
      const activo = habilitados.find((r) => r.getAttribute("aria-checked") === "true") ?? habilitados[0];
      radios.forEach((r) => (r.tabIndex = r === activo ? 0 : -1));
    };
    ordenar();
    const observador = new MutationObserver(ordenar);
    observador.observe(grupo, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-checked", "disabled"],
    });
    return () => observador.disconnect();
  }, []);

  const alPulsar = (e: KeyboardEvent<HTMLDivElement>) => {
    const pasos: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const grupo = ref.current;
    if (!grupo) return;
    const radios = Array.from(grupo.querySelectorAll<HTMLElement>(SELECTOR_RADIO)).filter(
      (r) => !r.hasAttribute("disabled")
    );
    if (radios.length === 0) return;
    const actual = radios.indexOf(document.activeElement as HTMLElement);
    let destino: number | null = null;
    if (e.key in pasos) destino = ((actual < 0 ? 0 : actual) + pasos[e.key] + radios.length) % radios.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = radios.length - 1;
    if (destino === null) return;
    e.preventDefault();
    radios[destino].focus();
    radios[destino].click();
  };

  return (
    // El grupo solo reparte el foco: cada opción es un botón con role="radio".
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div ref={ref} role="radiogroup" aria-label={etiqueta} onKeyDown={alPulsar} className={className}>
      {children}
    </div>
  );
}

export function OpcionTile({
  seleccionado,
  onSelect,
  titulo,
  detalle,
  icono: Icono,
  disabled = false,
  className,
}: {
  seleccionado: boolean;
  onSelect(): void;
  titulo: ReactNode;
  detalle?: ReactNode;
  icono?: Icon;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      disabled={disabled}
      onClick={() => {
        if (!seleccionado) onSelect();
      }}
      className={cn(
        "relative flex min-w-0 flex-col items-start gap-2 rounded-md border border-border bg-card p-4 text-left text-foreground transition-colors outline-none",
        "hover:border-input-border hover:bg-muted/50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        seleccionado && "border-accent-strong bg-accent-light ring-1 ring-accent-strong hover:border-accent-strong hover:bg-accent-light",
        !Icono && "pr-10",
        className
      )}
    >
      {Icono && (
        <Icono
          className={cn("size-5 shrink-0", seleccionado ? "text-accent-strong" : "text-muted-foreground")}
          aria-hidden
        />
      )}
      <span className="min-w-0 text-sm leading-tight font-semibold">{titulo}</span>
      {detalle && <span className="min-w-0 text-sm text-muted-foreground">{detalle}</span>}
      {seleccionado && (
        <CheckCircle className="absolute top-3 right-3 size-5 text-accent-strong" weight="fill" aria-hidden />
      )}
    </button>
  );
}
