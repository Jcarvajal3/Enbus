"use client";

// ─── Piezas comunes de los campos (components/campos) ────────────────────────
// Etiqueta asociada, ayuda o error (uno solo, con role="alert"), `aria-describedby` y el
// input oculto con la forma que se guarda (`name`), sobre `ui/field.tsx`.
// El contenedor usa `content-start`: en una fila con otro campo de ayuda más larga, la
// etiqueta y el control no bajan unos píxeles.

import type { HTMLAttributes, ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type EnterKeyHint = NonNullable<HTMLAttributes<HTMLInputElement>["enterKeyHint"]>;

/** Props que comparten todos los campos. */
export interface PropsCampoComun {
  /** Obligatorio: asocia la etiqueta, la ayuda y el error. */
  id: string;
  label: string;
  /** Un solo mensaje bajo el campo (`role="alert"`); reemplaza a la ayuda. */
  error?: string | null;
  /** Texto de apoyo bajo el campo mientras no hay error. */
  ayuda?: ReactNode;
  /** Añade " (opcional)" a la etiqueta; nada de asteriscos. */
  opcional?: boolean;
  disabled?: boolean;
  /** Crea un `<input type="hidden">` con la forma en que se guarda, para server actions. */
  name?: string;
  /** Tecla de acción del teclado móvil: "next" entre campos, "done" en el último. */
  enterKeyHint?: EnterKeyHint;
  autoFocus?: boolean;
  /** Solo `aria-required`: la validación la hace quien usa el campo. */
  required?: boolean;
  className?: string;
}

export function idsCampo(id: string, error?: string | null, ayuda?: ReactNode) {
  const errorId = `${id}-error`;
  const ayudaId = `${id}-ayuda`;
  return {
    errorId,
    ayudaId,
    /** Para `aria-describedby` del control. */
    describedBy: error ? errorId : ayuda ? ayudaId : undefined,
    invalido: error ? (true as const) : undefined,
  };
}

/** Etiqueta con el " (opcional)" de la regla de formularios. */
export function TextoEtiqueta({ label, opcional }: { label: string; opcional?: boolean }) {
  return (
    <>
      {label}
      {opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
    </>
  );
}

export function CampoContenedor({
  id,
  label,
  opcional,
  error,
  ayuda,
  disabled,
  className,
  paraControl = true,
  children,
  ocultos,
}: {
  id: string;
  label: string;
  opcional?: boolean;
  error?: string | null;
  ayuda?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** false si el control no es un input etiquetable (p. ej. un grupo de opciones): la etiqueta recibe `id="{id}-etiqueta"`. */
  paraControl?: boolean;
  children: ReactNode;
  /** Inputs ocultos con la forma guardada. */
  ocultos?: ReactNode;
}) {
  const { errorId, ayudaId } = idsCampo(id, error, ayuda);
  return (
    <Field
      className={cn("min-w-0 content-start", className)}
      data-invalid={error ? true : undefined}
      data-disabled={disabled || undefined}
    >
      <FieldLabel htmlFor={paraControl ? id : undefined} id={paraControl ? undefined : `${id}-etiqueta`}>
        <TextoEtiqueta label={label} opcional={opcional} />
      </FieldLabel>
      {children}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : ayuda ? (
        <FieldDescription id={ayudaId}>{ayuda}</FieldDescription>
      ) : null}
      {ocultos}
    </Field>
  );
}

/** Input con un adorno a la izquierda ("Bs") o a la derecha ("kg"), sobre el mismo borde. */
export const CLASE_ADORNO =
  "pointer-events-none absolute inset-y-0 flex items-center text-[15px] font-medium text-muted-foreground";
