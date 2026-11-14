import Link from "next/link";

/** Secciones de la portada. Con "/#…" sirven igual desde las páginas legales. */
export const SECCIONES = [
  { href: "/#rutas", texto: "Rutas" },
  { href: "/#como-funciona", texto: "Cómo funciona" },
  { href: "/#encomiendas", texto: "Encomiendas" },
  { href: "/#cooperativas", texto: "Cooperativas" },
] as const;

/** Barra del sitio: marca, cuatro enlaces y la única acción (rastrear un envío). */
export function Barra() {
  return (
    <header className="s-barra">
      <a href="#contenido" className="s-salto">
        Saltar al contenido
      </a>
      <div className="s-marco s-barra__fila">
        <Link href="/" className="s-marca" aria-label="EnBus, inicio">
          En<span>Bus</span>
        </Link>
        <nav aria-label="Secciones">
          <ul className="s-barra__enlaces">
            {SECCIONES.map((s) => (
              <li key={s.href}>
                <Link href={s.href}>{s.texto}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/#rastrear" className="s-boton s-boton--tinta">
          Rastrear envío
        </Link>
      </div>
    </header>
  );
}
