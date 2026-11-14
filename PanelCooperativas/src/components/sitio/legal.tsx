import { correoSoporte, soporteWhatsApp } from "@/lib/sitio/urls";

/** Fecha que se muestra en las tres páginas legales. Cámbiala cada vez que cambie el texto. */
export const LEGAL_ACTUALIZADO = "3 de noviembre de 2026";

interface PaginaLegalProps {
  titulo: string;
  /** Una o dos frases debajo del título: de qué trata la página. */
  resumen: string;
  children: React.ReactNode;
}

/**
 * Estructura común de /terminos, /privacidad y /eliminar-cuenta: a la izquierda el título,
 * la fecha y el aviso de revisión legal (paso manual 5 de la fase 4); a la derecha, el
 * texto en una hoja de papel. La app y el panel enlazan estas rutas: no cambiarlas.
 */
export function PaginaLegal({ titulo, resumen, children }: PaginaLegalProps) {
  return (
    <article className="s-legal">
      <div className="s-marco s-legal__rejilla">
        <header className="s-legal__cabeza">
          <h1>{titulo}</h1>
          <p>{resumen}</p>
          <p className="s-legal__fecha">Última actualización: {LEGAL_ACTUALIZADO}</p>
          <p role="note" className="s-legal__aviso">
            Este texto está en revisión legal.
          </p>
        </header>
        <div className="s-legal__hoja">{children}</div>
      </div>
    </article>
  );
}

/** Sección con título dentro de una página legal. */
export function SeccionLegal({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{titulo}</h2>
      {children}
    </section>
  );
}

/** Lista con viñetas para las páginas legales. */
export function ListaLegal({ items }: { items: React.ReactNode[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Canales de contacto configurados (WhatsApp y correo de soporte). Si no hay ninguno,
 * muestra `sinCanales` (o nada): nunca se ofrece un canal que no existe.
 */
export function ContactoSoporte({ mensaje, sinCanales }: { mensaje: string; sinCanales?: React.ReactNode }) {
  const whatsapp = soporteWhatsApp(mensaje);
  const correo = correoSoporte();
  if (!whatsapp && !correo) return sinCanales ? <>{sinCanales}</> : null;

  return (
    <ul>
      {whatsapp && (
        <li>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="s-enlace">
            Escríbenos por WhatsApp
          </a>
        </li>
      )}
      {correo && (
        <li>
          <a href={`mailto:${correo}?subject=${encodeURIComponent(mensaje)}`} className="s-enlace">
            {correo}
          </a>
        </li>
      )}
    </ul>
  );
}
