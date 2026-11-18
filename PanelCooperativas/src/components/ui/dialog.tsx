"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "@phosphor-icons/react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  asChild,
  render,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return (
      <DialogPrimitive.Trigger
        data-slot="dialog-trigger"
        render={children}
        {...props}
      />
    )
  }
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={render}
      {...props}
    >
      {children}
    </DialogPrimitive.Trigger>
  )
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-night/50 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// ─── Hoja inferior en móvil (< md) ──────────────────────────────────────────
// Dialog, AlertDialog y Sheet side="bottom" comparten estas clases: en móvil el
// popup se ancla abajo a todo el ancho (radio 3xl solo arriba, máx. 92dvh, cuerpo
// con scroll) y se desliza desde abajo (solo con `motion-safe`); desde `md` es el
// diálogo centrado de siempre. El padding (p-6) no cambia, así que un `p-0`
// puesto por el uso sigue valiendo.
export const HOJA_MOVIL_POPUP =
  "fixed z-50 grid w-full gap-6 overflow-y-auto overscroll-contain border-0 bg-popover p-6 text-[15px] text-popover-foreground shadow-overlay outline-none " +
  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl " +
  "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-2rem)] md:max-w-[calc(100%-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl " +
  "duration-100 max-md:duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 " +
  "md:data-open:zoom-in-95 md:data-closed:zoom-out-95 " +
  "motion-safe:max-md:data-open:slide-in-from-bottom-full motion-safe:max-md:data-closed:slide-out-to-bottom-full"

/**
 * Pie de hoja en móvil: pegado abajo mientras el cuerpo se desplaza, de borde a
 * borde, con el área segura inferior. Botones apilados a todo el ancho; con
 * `flex-col-reverse` el principal (último en el DOM) queda arriba.
 */
export const HOJA_MOVIL_PIE =
  "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-6 max-md:-mb-6 max-md:border-t max-md:border-border max-md:bg-popover max-md:px-6 max-md:pt-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]"

/** Asa decorativa de la hoja (solo móvil). */
export function AsaHoja({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="hoja-asa"
      className={cn(
        "pointer-events-none absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30 md:hidden",
        className
      )}
    />
  )
}

// Tres anchos de diálogo (D18). El alto máximo y el desplazamiento viven aquí:
// los usos no ponen `max-w-*` ni `max-h-*` propios.
const ANCHO_DIALOGO = {
  confirmar: "md:max-w-md",
  formulario: "md:max-w-lg",
  flujo: "md:max-w-2xl",
} as const

export type TamanoDialogo = keyof typeof ANCHO_DIALOGO

/**
 * Presentación en móvil: "hoja" (por defecto, anclada abajo, máx. 92 dvh) o "pantalla"
 * (ocupa toda la pantalla: h-dvh, sin radio, área segura superior). Desde `md` no cambia.
 */
export type MovilDialogo = "hoja" | "pantalla"

export const PANTALLA_MOVIL_POPUP =
  "max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:content-start max-md:rounded-none max-md:pt-[calc(1.5rem+env(safe-area-inset-top))] max-md:scroll-pb-32"

/** Botón de cerrar de hojas y diálogos: 44 px en móvil, 36 en escritorio. */
export function claseBotonCerrar(movil: MovilDialogo = "hoja") {
  return cn(
    "absolute right-5 size-11 md:size-9",
    movil === "pantalla"
      ? "top-[calc(1.25rem+env(safe-area-inset-top))] md:top-5"
      : "top-5"
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  tamano = "formulario",
  movil = "hoja",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** "hoja" (por defecto) o "pantalla": a pantalla completa en móvil. */
  movil?: MovilDialogo
  /** "confirmar" 448 px · "formulario" 512 px (por defecto) · "flujo" 672 px. */
  tamano?: TamanoDialogo
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-tamano={tamano}
        className={cn(
          HOJA_MOVIL_POPUP,
          ANCHO_DIALOGO[tamano],
          movil === "pantalla" && PANTALLA_MOVIL_POPUP,
          className
        )}
        {...props}
      >
        {movil === "hoja" && <AsaHoja />}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className={claseBotonCerrar(movil)}
                size="icon"
              />
            }
          >
            <XIcon aria-hidden />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 md:flex-row md:justify-end",
        HOJA_MOVIL_PIE,
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" size="lg" />}>
          Cerrar
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

/**
 * Fila de dos acciones secundarias dentro de `DialogFooter` (p. ej. "No recibir" +
 * "Cancelar"). En móvil quedan lado a lado, bajo la acción principal; desde `md` se
 * disuelven en el pie (`display: contents`) y siguen el orden normal. Pon `md:ml-auto`
 * al primer botón que deba ir pegado a la derecha junto a la principal.
 */
function DialogFooterFila({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer-fila"
      className={cn("grid grid-cols-2 gap-2 *:min-w-0 md:contents", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-[22px] leading-snug font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[15px] text-muted-foreground *:[a]:text-info-text *:[a]:underline *:[a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterFila,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
