import type { CSSProperties, ReactNode } from "react";

/**
 * Marco de teléfono para las maquetas de la app (HTML y CSS, sin capturas). El
 * contenido va dentro de la pantalla; es decorativo para los lectores de pantalla
 * salvo que se pase `etiqueta`, que lo describe como una imagen.
 */
export function Telefono({
  children,
  ancho = 300,
  etiqueta,
  className,
}: {
  children: ReactNode;
  /** Ancho en px del dispositivo (el alto sale de la proporción 9:19). */
  ancho?: number;
  /** Descripción para lectores de pantalla. Sin ella, la maqueta queda oculta (aria-hidden). */
  etiqueta?: string;
  className?: string;
}) {
  return (
    <div
      className={["s-telefono", className].filter(Boolean).join(" ")}
      style={{ ["--ancho-tel" as string]: `${ancho}px` } as CSSProperties}
      {...(etiqueta ? { role: "img", "aria-label": etiqueta } : { "aria-hidden": true })}
    >
      <div className="s-telefono__isla" />
      <div className="s-telefono__pantalla">{children}</div>
    </div>
  );
}
