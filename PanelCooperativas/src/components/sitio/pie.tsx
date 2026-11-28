import Link from "next/link";
import { ArrowUp, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";

import { correoSoporte, RUTAS_LEGALES, RUTAS_PANEL, RUTAS_SITIO, soporteWhatsApp } from "@/lib/sitio/urls";
import { CREDITOS_FOTOS } from "./fotos";
import estilos from "./pie.module.css";

const COLUMNAS = [
  {
    id: "pie-viajar",
    titulo: "Viajar",
    enlaces: [
      { href: "/viajes", texto: "Buscar pasajes" },
      { href: "/#salidas", texto: "Próximas salidas" },
      { href: "/#rutas", texto: "Rutas" },
      { href: "/#preguntas", texto: "Preguntas" },
      { href: "/#descargar", texto: "Descargar la app" },
    ],
  },
  {
    id: "pie-enviar",
    titulo: "Enviar",
    enlaces: [
      { href: "/#encomiendas", texto: "Encomiendas" },
      { href: "/#rastrear", texto: "Rastrear envío" },
    ],
  },
  {
    id: "pie-cooperativas",
    titulo: "Cooperativas",
    enlaces: [
      { href: RUTAS_SITIO.cooperativas, texto: "EnBus para cooperativas" },
      { href: RUTAS_PANEL.registro, texto: "Registrar mi cooperativa" },
      { href: RUTAS_PANEL.login, texto: "Entrar al panel" },
    ],
  },
  {
    id: "pie-legal",
    titulo: "Legal",
    enlaces: [
      { href: RUTAS_LEGALES.terminos, texto: "Términos" },
      { href: RUTAS_LEGALES.privacidad, texto: "Privacidad" },
      { href: RUTAS_LEGALES.eliminarCuenta, texto: "Eliminar cuenta" },
    ],
  },
] as const;

/** Pie del sitio: continúa la banda de noche de la descarga. */
export function Pie() {
  const whatsapp = soporteWhatsApp("Hola, tengo una pregunta sobre EnBus.");
  const correo = correoSoporte();
  const anio = new Date().getFullYear();

  return (
    <footer className={estilos.pie}>
      <div className="s-marco">
        <div className={estilos.superior}>
          <div className={estilos.marcaBloque}>
            <Link href="/" className={estilos.marca} aria-label="EnBus, inicio">
              En<span>Bus</span>
            </Link>
            <p>Pasajes de bus y encomiendas con cooperativas verificadas de Venezuela.</p>
          </div>
          {(whatsapp || correo) && (
            <ul className={estilos.contacto} aria-label="Contacto">
              {whatsapp && (
                <li>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <WhatsappLogo weight="regular" aria-hidden />
                    Escríbenos por WhatsApp
                  </a>
                </li>
              )}
              {correo && (
                <li>
                  <a href={`mailto:${correo}`}>
                    <EnvelopeSimple weight="regular" aria-hidden />
                    {correo}
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className={estilos.columnas}>
          {COLUMNAS.map((c) => (
            <nav key={c.id} aria-labelledby={c.id}>
              <h2 id={c.id}>{c.titulo}</h2>
              <ul>
                {c.enlaces.map((e) => (
                  <li key={e.href}>
                    <Link href={e.href}>{e.texto}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={estilos.final}>
          <p>© {anio} EnBus</p>
          <p>Hecho en Venezuela</p>
          <a href="#contenido" className={estilos.arriba}>
            Volver arriba
            <ArrowUp weight="bold" aria-hidden />
          </a>
        </div>

        <p className={estilos.creditos}>
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
