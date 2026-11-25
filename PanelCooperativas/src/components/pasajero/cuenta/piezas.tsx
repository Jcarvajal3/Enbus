import type { ReactNode } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  Info,
  MinusCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { EstadoVisible, TonoEstado } from "@/lib/pasajero/estados";
import estilos from "./cuenta-ui.module.css";

const ICONO_TONO: Record<TonoEstado, Icon> = {
  ok: CheckCircle,
  aviso: Clock,
  error: WarningCircle,
  info: Info,
  neutro: MinusCircle,
};

/** Chip de estado: color, icono y texto (nunca solo color). */
export function EstadoChip({ estado }: { estado: Pick<EstadoVisible, "etiqueta" | "tono"> }) {
  const Icono = ICONO_TONO[estado.tono];
  return (
    <span className={estilos.chip} data-tono={estado.tono}>
      <Icono aria-hidden weight="fill" />
      {estado.etiqueta}
    </span>
  );
}

export interface ItemPestana {
  clave: string;
  texto: string;
  href: string;
  cantidad?: number;
}

/** Pestañas que son enlaces: la elegida va en la URL (`?vista=`), así se puede compartir y volver atrás. */
export function Pestanas({ etiqueta, items, activa }: { etiqueta: string; items: ItemPestana[]; activa: string }) {
  return (
    <nav aria-label={etiqueta} className={estilos.pestanas}>
      <ul>
        {items.map((item) => (
          <li key={item.clave}>
            <Link
              href={item.href}
              className={estilos.pestana}
              aria-current={item.clave === activa ? "page" : undefined}
              replace
              scroll={false}
            >
              {item.texto}
              {item.cantidad !== undefined && item.cantidad > 0 && <span className={estilos.cuenta}>{item.cantidad}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Aviso en línea (informativo, de atención, de error o de éxito). */
export function Aviso({
  tono = "info",
  titulo,
  children,
  vivo,
}: {
  tono?: "info" | "aviso" | "error" | "ok";
  titulo?: string;
  children?: ReactNode;
  /** `role="alert"` para lo que aparece tras una acción. */
  vivo?: boolean;
}) {
  const Icono = tono === "ok" ? CheckCircle : tono === "error" ? WarningCircle : tono === "aviso" ? Clock : Info;
  return (
    <div className={estilos.aviso} data-tono={tono} role={vivo ? "alert" : undefined}>
      <Icono aria-hidden weight="fill" />
      <div>
        {titulo && <strong>{titulo}</strong>}
        {children}
      </div>
    </div>
  );
}

/** Estado vacío con una o dos salidas. */
export function EstadoVacio({
  icono,
  titulo,
  children,
  acciones,
}: {
  icono: ReactNode;
  titulo: string;
  children?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <section className={estilos.vacio} aria-labelledby="vacio-titulo">
      <span className="s-icono s-icono--sol" aria-hidden>
        {icono}
      </span>
      <h2 id="vacio-titulo">{titulo}</h2>
      {children && <p>{children}</p>}
      {acciones && <div className={estilos.vacioAcciones}>{acciones}</div>}
    </section>
  );
}

/** No se pudo leer la lista o el detalle: texto claro y salida para reintentar. */
export function ErrorCarga({ href, que }: { href: string; que: string }) {
  return (
    <EstadoVacio
      icono={<WarningCircle size={28} />}
      titulo={`No pudimos cargar ${que}`}
      acciones={
        <Link href={href} className="s-boton s-boton--tinta" prefetch={false}>
          Reintentar
        </Link>
      }
    >
      Revisa tu conexión e intenta de nuevo en unos segundos.
    </EstadoVacio>
  );
}
