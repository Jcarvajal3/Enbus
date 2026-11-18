import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── BarraAccionFija: la acción principal en el pulgar (móvil) ──────────────
// En móvil (< md) es una barra blanca fija abajo, POR ENCIMA de la barra de
// pestañas (`--alto-pestanas`, 0 px en ≥ md) y del área segura, con un `resumen`
// opcional de una línea (p. ej. "Total  $ 12,50") y la acción principal a todo
// el ancho. Deja un espaciador para que el contenido no quede tapado. En ≥ md se
// dibuja en línea (a la derecha, sin fijar) o no se dibuja (`escritorio="oculta"`,
// cuando la acción ya está en el `PageHeader`).
//
// Cuándo usarla en vez de la acción del `PageHeader`: cuando el botón es la razón
// de ser de la pantalla (cobrar, emitir, confirmar el formulario, guardar), o la
// página es larga y el botón del encabezado quedaría fuera de la vista.
//
//   <BarraAccionFija resumen={<>Total <Monto valor={total} size="md" /></>}>
//     <Button size="xl" disabled={!listo} onClick={cobrar}>Cobrar</Button>
//   </BarraAccionFija>
//
// Pon UN solo botón (el amarillo de la vista). Si lleva una secundaria, que sea
// `variant="outline"` y va después: en móvil se apila debajo.

export function BarraAccionFija({
  children,
  resumen,
  escritorio = "enlinea",
  anchoCompleto = false,
  className,
}: {
  /** La acción principal (`<Button size="xl">`), a todo el ancho en móvil. */
  children: ReactNode;
  /** Una línea de contexto sobre el botón: total, cantidad, paso. */
  resumen?: ReactNode;
  /** En ≥ md: "enlinea" (por defecto, sin fijar, a la derecha) u "oculta". */
  escritorio?: "enlinea" | "oculta";
  /** En ≥ md el botón también ocupa todo el ancho de la barra (p. ej. "Despachar N"). */
  anchoCompleto?: boolean;
  className?: string;
}) {
  const enLinea = escritorio === "enlinea";
  return (
    <>
      {/* Espaciador: alto de la barra + pestañas + área segura. Solo móvil. */}
      <div
        aria-hidden
        data-slot="barra-accion-fija-espaciador"
        className={cn(
          "md:hidden",
          resumen
            ? "h-[calc(8.5rem+max(var(--alto-pestanas,0px),env(safe-area-inset-bottom)))]"
            : "h-[calc(6.5rem+max(var(--alto-pestanas,0px),env(safe-area-inset-bottom)))]"
        )}
      />
      <div
        data-slot="barra-accion-fija"
        className={cn(
          "fixed inset-x-0 bottom-[calc(max(var(--alto-pestanas,0px),env(safe-area-inset-bottom)))] z-30 flex flex-col gap-2 border-t border-border bg-card px-5 pt-3 pb-3 shadow-overlay",
          enLinea
            ? cn(
                "md:static md:z-auto md:gap-4 md:border-0 md:bg-transparent md:p-0 md:shadow-none",
                anchoCompleto ? "md:items-stretch" : "md:flex-row md:items-center md:justify-between"
              )
            : "md:hidden",
          className
        )}
      >
        {resumen && (
          <div className="flex items-center justify-between gap-3 text-[15px] font-medium text-foreground tabular-nums md:justify-start md:text-muted-foreground">
            {resumen}
          </div>
        )}
        <div
          className={cn(
            "flex flex-col-reverse gap-2 max-md:*:w-full md:flex-row md:items-center md:gap-3",
            anchoCompleto ? "md:w-full md:*:flex-1" : "md:ml-auto"
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}
