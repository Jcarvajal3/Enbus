"use client";

// ─── Superficie flotante de los campos con selector (fecha, ciudad, banco) ────
// En escritorio (≥ md) un popover anclado al campo; en móvil, una hoja inferior (`ui/sheet`)
// con el teclado y el pulgar a mano. El contenido es el mismo en las dos.

import { cloneElement, useSyncExternalStore, type ReactElement, type ReactNode, type RefObject } from "react";
import { Popover } from "@base-ui/react/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ESCRITORIO = "(min-width: 768px)";

function suscribir(cambio: () => void) {
  const mq = window.matchMedia(ESCRITORIO);
  mq.addEventListener("change", cambio);
  return () => mq.removeEventListener("change", cambio);
}

/** true desde `md` (768 px). En el servidor y en la hidratación vale true. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(ESCRITORIO).matches,
    () => true
  );
}

export interface SuperficieCampoProps {
  abierto: boolean;
  onAbiertoChange(abierto: boolean): void;
  /** Título de la hoja (móvil) y nombre accesible del popover. */
  titulo: string;
  descripcion?: string;
  /** El botón del campo. Debe aceptar `onClick`, `ref` y las props de ARIA. */
  disparador: ReactElement<Record<string, unknown>>;
  /** Elemento que recibe el foco al abrir (por defecto, el primero enfocable). */
  focoInicial?: RefObject<HTMLElement | null>;
  /** Clases del popover (ancho). */
  className?: string;
  children: ReactNode;
}

export function SuperficieCampo({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  disparador,
  focoInicial,
  className,
  children,
}: SuperficieCampoProps) {
  const escritorio = useEsEscritorio();

  if (escritorio) {
    return (
      <Popover.Root open={abierto} onOpenChange={(abrir) => onAbiertoChange(abrir)}>
        <Popover.Trigger render={disparador} />
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="isolate z-50">
            <Popover.Popup
              aria-label={titulo}
              initialFocus={focoInicial}
              className={cn(
                "max-h-(--available-height) w-[min(22rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-2xl bg-popover p-3 text-[15px] text-popover-foreground shadow-overlay outline-none",
                "transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95 motion-reduce:transition-none",
                className
              )}
            >
              {children}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <>
      {cloneElement(disparador, {
        onClick: () => onAbiertoChange(true),
        "aria-haspopup": "dialog",
        "aria-expanded": abierto,
      })}
      <Sheet open={abierto} onOpenChange={(abrir) => onAbiertoChange(abrir)}>
        <SheetContent side="bottom" initialFocus={focoInicial}>
          <SheetHeader className="pb-2">
            <SheetTitle>{titulo}</SheetTitle>
            {descripcion ? <SheetDescription>{descripcion}</SheetDescription> : null}
          </SheetHeader>
          <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Aspecto de un botón-campo (igual que `ui/input` y el trigger de `ui/select`). */
export const CLASE_BOTON_CAMPO =
  "flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input-border bg-background px-4 text-left text-base outline-none transition-colors md:text-[15px] focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/20 aria-expanded:border-accent-strong aria-expanded:ring-[3px] aria-expanded:ring-accent-strong/20 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-dark disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** Variante sin valor: pozo hundido, como un input vacío. */
export const CLASE_BOTON_CAMPO_VACIO = "border-transparent bg-surface text-muted-foreground";
