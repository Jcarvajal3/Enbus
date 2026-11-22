import {
  Buildings,
  Bus,
  ClipboardText,
  Package,
  Receipt,
  Ticket,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { BrandMark } from "@/components/brand-mark";

// ─── Marco común de las pantallas de acceso (login, recuperar, restablecer,
// registro, invitación) del panel y del admin ─────────────────────────────────
// lg+: a la izquierda, panel de marca en `primary` (tinta sobre amarillo, igual
// en claro y oscuro) con lo que hace la zona; queda fijo al desplazar los
// formularios largos. A la derecha, el formulario sobre el fondo, sin tarjeta.
// md–lg: la marca arriba y el formulario en una tarjeta centrada sobre `muted`.
// Teléfono: el formulario se funde con el fondo, empieza arriba (sin huecos
// cuando sale el teclado) y el pie de página va al final. El título es siempre
// el H1 de la pantalla. Sigue el tema elegido (D14).

type Zona = "cooperativas" | "admin";

const ZONA = { cooperativas: "Cooperativas", admin: "Administración" } as const;

const MARCA: Record<Zona, { antetitulo: string; titular: string; texto: string; puntos: { icono: Icon; titulo: string; detalle: string }[] }> = {
  cooperativas: {
    antetitulo: "Panel de cooperativas",
    titular: "Vende, despacha y entrega desde un solo lugar.",
    texto: "La taquilla, las encomiendas y los viajes de tu cooperativa, en la PC del terminal o en el teléfono.",
    puntos: [
      { icono: Ticket, titulo: "Taquilla de boletos", detalle: "Vende en el mostrador y verifica los pagos de la app." },
      { icono: Package, titulo: "Encomiendas", detalle: "Recibe, despacha y entrega con su código de rastreo." },
      { icono: Bus, titulo: "Viajes y embarque", detalle: "Organiza salidas, unidades y el abordaje de pasajeros." },
    ],
  },
  admin: {
    antetitulo: "Administración EnBus",
    titular: "Toda la red de cooperativas, en un solo panel.",
    texto: "Solicitudes, cuentas y cobros de la plataforma, para el equipo de EnBus.",
    puntos: [
      { icono: ClipboardText, titulo: "Solicitudes", detalle: "Revisa y aprueba las cooperativas que se registran." },
      { icono: Buildings, titulo: "Cooperativas y usuarios", detalle: "Gestiona cuentas, accesos e incidencias." },
      { icono: Receipt, titulo: "Comisiones y tasa BCV", detalle: "Controla comisiones y la tasa oficial BCV." },
    ],
  },
};

/** Ruta punteada con paradas: adorno del panel de marca (solo `currentColor`). En
 * pantallas bajas se oculta para no cruzarse con el texto. */
function RutaDecorativa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden focusable="false" className={className}>
      <path
        d="M-40 380C60 380 110 300 190 280S320 220 330 120S380 -10 440 -30"
        stroke="currentColor"
        strokeOpacity="0.07"
        strokeWidth="44"
        strokeLinecap="round"
      />
      <path
        d="M-40 380C60 380 110 300 190 280S320 220 330 120S380 -10 440 -30"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      {[
        [190, 280],
        [330, 120],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="15" fill="currentColor" fillOpacity="0.12" />
          <circle cx={cx} cy={cy} r="6" fill="currentColor" fillOpacity="0.45" />
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
  const nombreZona = ZONA[zona];
  const marca = MARCA[zona];
  const anio = new Date().getFullYear();

  return (
    <div className="grid min-h-svh w-full flex-1 bg-canvas lg:grid-cols-[minmax(26rem,5fr)_7fr]">
      <aside className="relative hidden overflow-hidden bg-night text-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <RutaDecorativa className="pointer-events-none absolute hidden [@media(min-height:50rem)]:block -right-6 -bottom-12 size-[28rem] text-white" />

        <BrandMark tamano="lg" conNombre zona={nombreZona} sobreNoche className="relative" />

        <div className="relative flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-[13px] font-semibold text-primary">{marca.antetitulo}</p>
            <p className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">{marca.titular}</p>
            <p className="text-base text-pretty text-night-muted">{marca.texto}</p>
          </div>
          <ul className="flex flex-col gap-5">
            {marca.puntos.map(({ icono: Icono, titulo: tituloPunto, detalle }) => (
              <li key={tituloPunto} className="flex items-start gap-3.5">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-night-raised text-primary">
                  <Icono className="size-6" weight="fill" aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5 pt-0.5">
                  <span className="text-[15px] font-semibold">{tituloPunto}</span>
                  <span className="text-[13px] text-night-muted">{detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-night-muted">© {anio} EnBus · Venezuela</p>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col lg:bg-canvas">
        <header className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pt-8 lg:hidden">
          <BrandMark tamano="md" conNombre zona={nombreZona} />
        </header>

        <main className="flex flex-1 flex-col items-center px-5 pt-8 pb-10 md:justify-center md:px-8 md:py-10 lg:px-12">
          <div className="flex w-full max-w-md flex-col gap-6 md:rounded-3xl md:bg-card md:p-8 md:shadow-raised lg:max-w-sm lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 xl:max-w-[25rem]">
            <div className="flex flex-col gap-2">
              <h1 className="text-[26px] font-semibold tracking-tight text-balance text-foreground lg:text-[32px]">{titulo}</h1>
              {descripcion && <p className="text-[15px] text-pretty text-muted-foreground">{descripcion}</p>}
            </div>
            {children}
            {pie && (
              <div className="border-t border-border pt-6 text-center text-[15px] text-muted-foreground">{pie}</div>
            )}
          </div>
        </main>

        <footer className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground md:px-8 lg:hidden">© {anio} EnBus</footer>
      </div>
    </div>
  );
}
