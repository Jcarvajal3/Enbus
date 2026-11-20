"use client";

// ─── BarraFlujo: la acción del paso, siempre a mano ─────────────────────────
// Equivalente web de `FloatingBar` (app): resumen de una línea ("Asientos 3 y
// 4 · Bs 2.500,00") encima del botón principal. Va pegada al fondo de la
// ventana PERO dentro del área de contenido (`position: sticky`), por eso:
//   · en escritorio queda alineada con el contenido, nunca bajo el menú lateral
//     (aunque esté plegado) ni fuera del `SidebarInset`;
//   · ocupa su lugar en el flujo: el contenido nunca queda tapado;
//   · en móvil se apoya sobre la barra de pestañas (`--alto-pestanas`) y el
//     área segura, igual que `BarraAccionFija`.
// Pásala como `barra` de `<FlujoPagina>` (o como último hijo de su contenedor).
//
//   <BarraFlujo
//     resumen={<>Asientos 3 y 4 · <TotalCorto usd={25} /></>}
//     principal={{ etiqueta: "Continuar", onClick: siguiente, deshabilitado: !listo }}
//   />
//   // Paso con formulario: el botón envía el <form id="pasajeros">
//   <BarraFlujo principal={{ etiqueta: "Cobrar Bs 2.500,00", type: "submit", form: "pasajeros", cargando }} />
//   // Con acción secundaria (outline, a la izquierda del principal en escritorio)
//   <BarraFlujo principal={…} secundaria={{ etiqueta: "Imprimir", onClick: imprimir }} />

import type { ReactNode } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AccionBarraFlujo = {
  etiqueta: ReactNode;
  onClick?: () => void;
  /** "submit" junto con `form` envía un formulario que está en el contenido. Por defecto "button". */
  type?: "button" | "submit";
  /** `id` del `<form>` que envía (si el botón no está dentro de él). */
  form?: string;
  /** Operación en curso: spinner, `aria-busy` y sin clics (el botón conserva el foco). */
  cargando?: boolean;
  /** Texto mientras `cargando`; por defecto se mantiene la etiqueta. */
  etiquetaCargando?: ReactNode;
  deshabilitado?: boolean;
  /** Solo el principal: `destructive` para acciones irreversibles. */
  variante?: "default" | "destructive";
};

export type AccionSecundariaBarraFlujo = Pick<
  AccionBarraFlujo,
  "etiqueta" | "onClick" | "type" | "form" | "deshabilitado"
>;

export function BarraFlujo({
  resumen,
  principal,
  secundaria,
  className,
}: {
  /** Una línea de lo elegido. Se anuncia (`aria-live="polite"`) al cambiar. */
  resumen?: ReactNode;
  principal: AccionBarraFlujo;
  secundaria?: AccionSecundariaBarraFlujo;
  className?: string;
}) {
  const { cargando = false, deshabilitado = false, variante = "default" } = principal;
  return (
    <div
      data-slot="barra-flujo"
      className={cn(
        // Pegada al fondo del contenido: `-mx/-mb` contrarrestan el relleno del shell (p-5 / lg:p-8).
        "sticky bottom-[max(var(--alto-pestanas,0px),env(safe-area-inset-bottom))] z-20 mt-auto -mx-5 -mb-5 border-t border-border bg-card shadow-overlay lg:-mx-8 lg:-mb-8 md:rounded-b-md",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-5 pt-3 pb-3 lg:px-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Siempre montada para que los lectores de pantalla anuncien los cambios. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="text-[15px] font-medium text-foreground tabular-nums empty:hidden md:text-muted-foreground"
        >
          {resumen}
        </div>
        <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          {secundaria && (
            <Button
              key={`${secundaria.type ?? "button"}:${secundaria.form ?? ""}`}
              type={secundaria.type ?? "button"}
              form={secundaria.form}
              variant="outline"
              size="lg"
              disabled={secundaria.deshabilitado}
              onClick={secundaria.onClick}
              className="max-md:w-full"
            >
              {secundaria.etiqueta}
            </Button>
          )}
          <Button
            // Clave por tipo y formulario: si un clic avanza de paso y el siguiente usa un botón
            // `submit`, React reutilizaría el mismo <button> y el navegador, al terminar ese clic,
            // enviaría el formulario recién montado (errores antes de escribir). Con otra clave el
            // botón pulsado se desmonta y el nuevo nace limpio.
            key={`${principal.type ?? "button"}:${principal.form ?? ""}`}
            type={principal.type ?? "button"}
            form={principal.form}
            variant={variante}
            size="xl"
            disabled={deshabilitado && !cargando}
            aria-busy={cargando || undefined}
            aria-disabled={cargando || undefined}
            onClick={(e) => {
              if (cargando) {
                e.preventDefault();
                return;
              }
              principal.onClick?.();
            }}
            className={cn(
              "max-md:w-full",
              // Cargando no se ve "apagado": sigue siendo la acción de la vista.
              cargando &&
                (variante === "destructive"
                  ? "aria-disabled:bg-destructive-text aria-disabled:text-background"
                  : "aria-disabled:bg-primary aria-disabled:text-primary-foreground aria-disabled:shadow-sun")
            )}
          >
            {cargando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
            {cargando && principal.etiquetaCargando ? principal.etiquetaCargando : principal.etiqueta}
          </Button>
        </div>
      </div>
    </div>
  );
}
