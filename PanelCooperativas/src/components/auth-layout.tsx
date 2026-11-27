import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Buildings,
  Bus,
  ClipboardText,
  Package,
  Receipt,
  Ticket,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

import "@/app/(sitio)/sitio.css";
import estilos from "./auth-layout.module.css";

// ─── Marco común de las pantallas de acceso (login, recuperar, restablecer,
// registro, invitación) del panel y del admin ─────────────────────────────────
// Es la puerta de entrada, no el panel: usa el sistema del sitio público (`.sitio`)
// y va siempre en claro (ThemeProvider lo fuerza). Barra en pastilla con la marca y
// la vuelta al sitio; debajo, una hoja partida: el formulario y, en escritorio, un
// panel de noche con lo que hace la zona, que se queda a la vista en el registro
// largo. En el teléfono solo queda el formulario. El título es siempre el H1.

type Zona = "cooperativas" | "admin";

const ZONA = { cooperativas: "Cooperativas", admin: "Administración" } as const;

const MARCA: Record<Zona, { antetitulo: string; titular: ReactNode; texto: string; puntos: { icono: Icon; titulo: string; detalle: string }[] }> = {
  cooperativas: {
    antetitulo: "Panel de cooperativas",
    titular: (
      <>
        Vende, despacha y entrega <em>desde un solo lugar</em>
      </>
    ),
    texto: "La taquilla, las encomiendas y los viajes de tu cooperativa, en la PC del terminal o en el teléfono.",
    puntos: [
      { icono: Ticket, titulo: "Taquilla de boletos", detalle: "Vende en el mostrador y verifica los pagos de la app." },
      { icono: Package, titulo: "Encomiendas", detalle: "Recibe, despacha y entrega con su código de rastreo." },
      { icono: Bus, titulo: "Viajes y embarque", detalle: "Organiza salidas, unidades y el abordaje de pasajeros." },
    ],
  },
  admin: {
    antetitulo: "Administración EnBus",
    titular: (
      <>
        Toda la red de cooperativas, <em>en un solo panel</em>
      </>
    ),
    texto: "Solicitudes, cuentas y operación de la plataforma, para el equipo de EnBus.",
    puntos: [
      { icono: ClipboardText, titulo: "Solicitudes", detalle: "Revisa y aprueba las cooperativas que se registran." },
      { icono: Buildings, titulo: "Cooperativas y usuarios", detalle: "Gestiona cuentas, accesos e incidencias." },
      { icono: Receipt, titulo: "Tasa BCV", detalle: "Controla la tasa oficial BCV." },
    ],
  },
};

/** Ruta punteada con paradas: adorno del panel de marca (solo `currentColor`). */
function RutaDecorativa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden focusable="false" className={className}>
      <path
        d="M-40 380C60 380 110 300 190 280S320 220 330 120S380 -10 440 -30"
        stroke="currentColor"
        strokeOpacity="0.06"
        strokeWidth="44"
        strokeLinecap="round"
      />
      <path
        d="M-40 380C60 380 110 300 190 280S320 220 330 120S380 -10 440 -30"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      {[
        [190, 280],
        [330, 120],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="15" fill="currentColor" fillOpacity="0.1" />
          <circle cx={cx} cy={cy} r="6" fill="currentColor" fillOpacity="0.4" />
        </g>
      ))}
    </svg>
  );
}

export function AuthLayout({
  zona,
  titulo,
  descripcion,
  children,
  pie,
}: {
  zona: Zona;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  const marca = MARCA[zona];
  const anio = new Date().getFullYear();

  return (
    <div className={`sitio ${estilos.raiz}`}>
      <header className={estilos.barra}>
        <div className={`s-marco ${estilos.barraFila}`}>
          <Link href="/" className={estilos.marca} aria-label="EnBus, ir al sitio">
            En<span>Bus</span>
          </Link>
          <span className={estilos.zona}>{ZONA[zona]}</span>
          <Link href="/" className={estilos.volver}>
            <span className={estilos.volverTexto}>Ir al sitio</span>
            <ArrowUpRight weight="bold" aria-hidden />
          </Link>
        </div>
      </header>

      <main className={estilos.pagina}>
        <div className={estilos.hoja}>
          <section className={estilos.formulario} aria-labelledby="acceso-titulo">
            <header className={estilos.cabeza}>
              <h1 id="acceso-titulo" className={estilos.titulo}>
                {titulo}
              </h1>
              {descripcion && <p className={estilos.descripcion}>{descripcion}</p>}
            </header>
            {children}
            {pie && <footer className={estilos.pie}>{pie}</footer>}
          </section>

          <aside className={estilos.lado} aria-label={marca.antetitulo}>
            <RutaDecorativa className={estilos.ruta} />
            <div className={estilos.antetitulo}>
              <p className={estilos.chip}>{marca.antetitulo}</p>
              <p className={estilos.titular}>{marca.titular}</p>
              <p className={estilos.texto}>{marca.texto}</p>
            </div>
            <ul className={estilos.puntos}>
              {marca.puntos.map(({ icono: Icono, titulo: tituloPunto, detalle }) => (
                <li key={tituloPunto} className={estilos.punto}>
                  <span className={estilos.puntoIcono} aria-hidden>
                    <Icono weight="fill" />
                  </span>
                  <span className={estilos.puntoTexto}>
                    <strong>{tituloPunto}</strong>
                    <span>{detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className={estilos.derechos}>© {anio} EnBus · Venezuela</p>
          </aside>
        </div>
      </main>

      <p className={estilos.derechosMovil}>© {anio} EnBus · Venezuela</p>
    </div>
  );
}
