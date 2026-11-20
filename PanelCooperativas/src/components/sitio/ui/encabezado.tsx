import type { ReactNode } from "react";

interface EncabezadoSeccionProps {
  /** id del <h2>: la sección lo usa en `aria-labelledby`. */
  id: string;
  /** Etiqueta corta sobre el título, en frase normal (nunca en mayúsculas). */
  etiqueta?: string;
  titulo: ReactNode;
  bajada?: ReactNode;
  alineacion?: "inicio" | "centro";
  /** "coral" tiñe la etiqueta con el color de encomiendas. */
  tono?: "cielo" | "coral";
  /** Acciones o contenido extra debajo de la bajada. */
  children?: ReactNode;
  className?: string;
}

/** Encabezado común de cada sección del sitio: etiqueta, título (h2) y bajada. */
export function EncabezadoSeccion({
  id,
  etiqueta,
  titulo,
  bajada,
  alineacion = "inicio",
  tono = "cielo",
  children,
  className,
}: EncabezadoSeccionProps) {
  const clases = ["s-cab", alineacion === "centro" && "s-cab--centro", tono === "coral" && "s-cab--coral", className]
    .filter(Boolean)
    .join(" ");
  return (
    <header className={clases} data-revelar>
      {etiqueta && <p className="s-cab__etiqueta">{etiqueta}</p>}
      <h2 id={id}>{titulo}</h2>
      {bajada && <p className="s-cab__bajada">{bajada}</p>}
      {children}
    </header>
  );
}
