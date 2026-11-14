import Link from "next/link";

import { correoSoporte, RUTAS_LEGALES, RUTAS_PANEL, soporteWhatsApp } from "@/lib/sitio/urls";
import { CREDITOS_FOTOS } from "./fotos";

/** El reverso del boleto: la marca a todo lo ancho, los caminos para llegar y los créditos. */
export function Pie() {
  const whatsapp = soporteWhatsApp("Hola, tengo una pregunta sobre EnBus.");
  const correo = correoSoporte();
  const anio = new Date().getFullYear();

  return (
    <footer className="s-pie">
      <div className="s-marco">
        <p className="s-pie__marca" aria-hidden>
          EnBus
        </p>
        <div className="s-pie__fila">
          <ul className="s-pie__lugares">
            <li>
              <Link href="/#rastrear">Rastrear un envío</Link>
            </li>
            <li>
              <Link href={RUTAS_PANEL.registro}>Registrar una cooperativa</Link>
            </li>
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  Escríbenos por WhatsApp
                </a>
              </li>
            )}
            {correo && (
              <li>
                <a href={`mailto:${correo}`}>{correo}</a>
              </li>
            )}
          </ul>

          <div className="s-pie__columnas">
            <nav aria-labelledby="pie-viajar">
              <h2 id="pie-viajar">Viajar</h2>
              <ul>
                <li>
                  <Link href="/#rutas">Rutas</Link>
                </li>
                <li>
                  <Link href="/#como-funciona">Cómo funciona</Link>
                </li>
                <li>
                  <Link href="/#preguntas">Preguntas</Link>
                </li>
              </ul>
            </nav>
            <nav aria-labelledby="pie-enviar">
              <h2 id="pie-enviar">Enviar</h2>
              <ul>
                <li>
                  <Link href="/#encomiendas">Encomiendas</Link>
                </li>
                <li>
                  <Link href="/#rastrear">Rastreo</Link>
                </li>
                <li>
                  <Link href={RUTAS_PANEL.login}>Panel de cooperativas</Link>
                </li>
              </ul>
            </nav>
            <nav aria-labelledby="pie-legal">
              <h2 id="pie-legal">Legal</h2>
              <ul>
                <li>
                  <Link href={RUTAS_LEGALES.terminos}>Términos</Link>
                </li>
                <li>
                  <Link href={RUTAS_LEGALES.privacidad}>Privacidad</Link>
                </li>
                <li>
                  <Link href={RUTAS_LEGALES.eliminarCuenta}>Eliminar cuenta</Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="s-pie__final">
          <p>© {anio} EnBus · Boletos y encomiendas con cooperativas de Venezuela</p>
          <a href="#contenido" className="s-enlace">
            Volver arriba
          </a>
        </div>
        <p className="s-pie__creditos">
          Fotos de Wikimedia Commons:{" "}
          {CREDITOS_FOTOS.map((c, i) => (
            <span key={c.pagina}>
              <a href={c.pagina} target="_blank" rel="noopener noreferrer">
                «{c.titulo}»
              </a>{" "}
              de {c.autor} (
              <a href={c.licenciaUrl} target="_blank" rel="noopener noreferrer">
                {c.licencia}
              </a>
              ){i < CREDITOS_FOTOS.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
