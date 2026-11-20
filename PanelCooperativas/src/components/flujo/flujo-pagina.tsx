"use client";

// ─── FlujoPagina: página de un asistente (venta, encomienda…) ───────────────
// Equivalente web de `ScreenHeader variant="steps"` de la app: botón ←, título
// del paso (h1), tramos de progreso y "Paso n de N". Va dentro del shell del
// panel: en móvil ocupa todo el ancho (con el relleno del shell); en escritorio
// el contenido se centra en `max-w-2xl`. La `barra` queda pegada al fondo del
// área de contenido y reserva su propio espacio (no tapa nada).
//
// Al cambiar de paso (o de título) hace scroll arriba y mueve el foco al h1
// (sin desplazar la página) para que los lectores de pantalla anuncien el paso.
// Sin `paso`/`total` (fases finales: "Boletos emitidos") oculta el indicador.
//
//   const PASOS = ["salida", "asientos", "pasajeros", "pago"] as const;
//   const url = usePasoEnUrl(PASOS, { esAccesible });
//   const { dialogo, confirmarSalida } = useSalidaProtegida({ activo: sucio, bloqueado: enviando });
//
//   <>
//     {dialogo}
//     <FlujoPagina
//       titulo={TITULOS[url.paso]}
//       paso={url.numero}
//       total={url.total}
//       onAtras={() => (url.indice > 0 ? url.anterior() : confirmarSalida(() => router.push(volver)))}
//       atrasEtiqueta={url.indice > 0 ? "Volver al paso anterior" : "Salir de la venta"}
//       barra={<BarraFlujo resumen="Asientos 3 y 4 · Bs 2.500,00" principal={{ etiqueta: "Continuar", onClick: url.siguiente }} />}
//     >
//       …contenido del paso…
//     </FlujoPagina>
//   </>
//
// El relleno lateral lo pone el shell (20 px móvil / 32 px ≥ lg).

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FlujoPagina({
  titulo,
  paso,
  total,
  onAtras,
  atrasEtiqueta = "Volver al paso anterior",
  descripcion,
  barra,
  children,
  className,
}: {
  /** Título del paso (el h1 de la página). */
  titulo: string;
  /** Número del paso, base 1. Sin `paso` y `total` no se dibuja el indicador. */
  paso?: number;
  total?: number;
  /** Sin él no se dibuja la flecha (fases en las que no se puede volver). */
  onAtras?: () => void;
  /** `aria-label` de la flecha: "Volver al paso anterior" o "Salir de la venta". */
  atrasEtiqueta?: string;
  /** Línea de apoyo bajo el título. */
  descripcion?: ReactNode;
  /** Normalmente un `<BarraFlujo>`. */
  barra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const primera = useRef(true);
  const clave = `${paso ?? ""}|${titulo}`;

  useEffect(() => {
    // Al montar la página no se roba el foco (puede haber un campo con autoFocus).
    if (primera.current) {
      primera.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    tituloRef.current?.focus({ preventScroll: true });
  }, [clave]);

  const hayIndicador = paso !== undefined && total !== undefined && total > 0;

  return (
    <div data-slot="flujo-pagina" className="flex flex-1 flex-col">
      <div className={cn("mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 pb-6", className)}>
        <header className="flex flex-col gap-4">
          {(onAtras || hayIndicador) && (
            <div className="flex items-center gap-4">
              {onAtras && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={atrasEtiqueta}
                  onClick={onAtras}
                >
                  <ArrowLeftIcon aria-hidden className="size-5" />
                </Button>
              )}
              {hayIndicador && <Indicador paso={paso} total={total} />}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <h1
              ref={tituloRef}
              tabIndex={-1}
              className="text-[26px] leading-tight font-semibold tracking-tight text-balance outline-none md:text-[32px]"
            >
              {titulo}
            </h1>
            {descripcion && <p className="text-[15px] text-muted-foreground">{descripcion}</p>}
          </div>
        </header>
        {children}
      </div>
      {barra}
    </div>
  );
}

/** Tramos (uno por paso; llenos hasta el actual) + "Paso n de N". */
function Indicador({ paso, total }: { paso: number; total: number }) {
  const actual = Math.min(Math.max(paso, 1), total);
  const texto = `Paso ${actual} de ${total}`;
  return (
    <div
      role="progressbar"
      aria-label="Progreso"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={actual}
      aria-valuetext={texto}
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      <div aria-hidden className="flex min-w-0 flex-1 gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full motion-safe:transition-colors motion-safe:duration-300",
              i + 1 <= actual ? "bg-primary" : "bg-surface-dark"
            )}
          />
        ))}
      </div>
      <span aria-hidden className="shrink-0 text-[13px] font-semibold text-muted-foreground tabular-nums">
        {texto}
      </span>
    </div>
  );
}
