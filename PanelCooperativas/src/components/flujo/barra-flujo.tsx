"use client";

// ─── BarraFlujo: la acción del paso, siempre a mano ─────────────────────────
// Equivalente web de `FloatingBar` (app). Bloque izquierdo con jerarquía: una
// etiqueta pequeña (`resumen`, "Asiento 20 · Mérida → Barinas") y, debajo, el
// TOTAL destacado (`total`: monto grande + secundario apagado, p. ej. "≈ USD
// 15,00"). Sin `total`, `resumen` se muestra como texto normal (pasos sin monto:
// "Elige la sucursal"). A la derecha, la acción principal (con `flecha`
// opcional) y la secundaria. En móvil todo se apila: etiqueta, total y los
// botones a ancho completo debajo; desde `md`, UNA fila (bloque | botones).
// Va pegada al fondo de la ventana PERO dentro del área de contenido
// (`position: sticky`), por eso:
//   · en escritorio queda alineada con el contenido, nunca bajo el menú lateral
//     (aunque esté plegado) ni fuera del `SidebarInset`;
//   · ocupa su lugar en el flujo: el contenido nunca queda tapado;
//   · en móvil se apoya sobre la barra de pestañas (`--alto-pestanas`) y el
//     área segura, igual que `BarraAccionFija`.
// Pásala como `barra` de `<FlujoPagina>` (o como último hijo de su contenedor).
//
//   <BarraFlujo
//     resumen="Asiento 20 · Mérida → Barinas"
//     total={{ valor: "Bs 13.895,39", secundario: "≈ USD 15,00", accesible: "13.895,39 bolívares" }}
//     principal={{ etiqueta: "Continuar", flecha: true, onClick: siguiente, deshabilitado: !listo }}
//   />
//   // Paso sin monto: solo texto
//   <BarraFlujo resumen="Elige la sucursal" principal={…} />
//   // Paso con formulario: el botón envía el <form id="pasajeros">
//   <BarraFlujo principal={{ etiqueta: "Cobrar Bs 2.500,00", type: "submit", form: "pasajeros", cargando }} />
//   // Con acción secundaria (outline, a la izquierda del principal en escritorio)
//   <BarraFlujo principal={…} secundaria={{ etiqueta: "Imprimir", onClick: imprimir }} />

import type { ReactNode } from "react";
import { ArrowRightIcon, SpinnerIcon } from "@phosphor-icons/react";
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
  /** Solo el principal: flecha → después de la etiqueta (oculta mientras `cargando`). */
  flecha?: boolean;
};

export type AccionSecundariaBarraFlujo = Pick<
  AccionBarraFlujo,
  "etiqueta" | "onClick" | "type" | "form" | "deshabilitado"
>;

/** El monto protagonista de la barra. */
export type TotalBarraFlujo = {
  /** Monto grande (texto o un componente como `<TotalCorto />`). */
  valor: ReactNode;
  /** Apoyo apagado en la misma línea: "≈ USD 15,00", "estimado". */
  secundario?: ReactNode;
  /** Lectura para lectores de pantalla (p. ej. `formatMoney(...).accesible`). */
  accesible?: string;
};

export function BarraFlujo({
  resumen,
  total,
  principal,
  secundaria,
  className,
}: {
  /** Etiqueta de una línea de lo elegido (encima del `total`, o sola sin él). Se anuncia al cambiar. */
  resumen?: ReactNode;
  /** Monto destacado. Con él, `resumen` pasa a ser la etiqueta pequeña. */
  total?: TotalBarraFlujo;
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
        "sticky bottom-(--alto-pestanas) z-20 mt-auto -mx-5 -mb-5 border-t border-border bg-card shadow-overlay lg:-mx-8 lg:-mb-8 md:rounded-b-md",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-5 md:py-4 lg:px-0">
        {/* Siempre montada para que los lectores de pantalla anuncien los cambios. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "min-w-0 empty:hidden md:flex-1",
            total
              ? "flex flex-col gap-1 md:gap-1.5"
              : "text-[15px] font-medium text-foreground tabular-nums md:text-balance"
          )}
        >
          {total ? (
            <>
              {resumen && (
                <div className="min-w-0 truncate text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {resumen}
                </div>
              )}
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {/* `aria-label` en un <span> sin rol no se lee: la lectura va en texto sr-only. */}
                {total.accesible && <span className="sr-only">{total.accesible}</span>}
                <span
                  aria-hidden={total.accesible ? true : undefined}
                  className="font-heading text-[22px] leading-none font-semibold tracking-tight text-foreground tabular-nums md:text-[26px]"
                >
                  {total.valor}
                </span>
                {total.secundario && (
                  <span className="text-[14px] text-muted-foreground tabular-nums">{total.secundario}</span>
                )}
              </div>
            </>
          ) : (
            resumen
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 md:ml-auto md:shrink-0 md:flex-row md:items-center md:gap-3">
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
            {principal.flecha && !cargando && (
              <ArrowRightIcon
                weight="bold"
                className="motion-safe:transition-transform motion-safe:group-hover/button:translate-x-0.5"
                aria-hidden
              />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
