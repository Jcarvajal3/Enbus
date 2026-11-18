import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ─── EntityCard: la fila de una lista en móvil (Amanecer) ───────────────────
// Equivale a `EntityCard` de la app: tarjeta blanca sin borde, toda tocable.
// IconTile a la izquierda, título 17 semibold (una ruta "A → B" dibuja su
// flecha), subtítulo 13 muted, `adorno` a la derecha (monto, hora) y, bajo una
// línea fina, el estado (`badge`) y el dato breve (`meta`). Alto mínimo 64 px,
// objetivo táctil completo y estado activo al tocar.
//
// Es la versión móvil de una fila de tabla: úsala dentro de `ListaResponsive`
// (o en una lista `md:hidden` con `gap-3`).
//
//   <EntityCard
//     href={`/cooperativas/encomiendas/${e.id}`}
//     leading={<IconTile icon={Package} tone="coral" />}
//     title={`${e.origen} → ${e.destino}`}
//     subtitle={e.destinatario}
//     adorno={<Monto valor={e.monto} size="sm" />}
//     badge={<StatusBadge status={e.estado} dominio="encomienda" />}
//     meta={e.codigo}
//   />

export interface EntityCardProps {
  title: string;
  subtitle?: string;
  /** Cuadrito con icono a la izquierda (`<IconTile …/>`). */
  leading?: ReactNode;
  /** A la derecha del título: un monto, una hora, un conteo. */
  adorno?: ReactNode;
  /** Pie, a la izquierda: `<StatusBadge …/>` o `<TonoBadge …/>`. */
  badge?: ReactNode;
  /** Pie, a la derecha: un código, una fecha, un número de asientos. */
  meta?: ReactNode;
  /** La tarjeta navega: se dibuja como enlace. */
  href?: string;
  /** La tarjeta abre una hoja o un diálogo: se dibuja como botón. */
  onClick?(): void;
  /** Flecha a la derecha. Por defecto, sí cuando hay `href` u `onClick`. */
  chevron?: boolean;
  /** Líneas máximas del subtítulo (por defecto 1). */
  lineasSubtitulo?: number;
  /** Nombre accesible; por defecto "título. subtítulo". */
  etiqueta?: string;
  /**
   * Acciones bajo la tarjeta (botones `size="lg"` a ancho completo). Van FUERA del enlace o
   * botón de la tarjeta, así no se anidan interactivos: la tarjeta pasa a ser un contenedor
   * y el enlace/botón es su parte de arriba.
   */
  acciones?: ReactNode;
  className?: string;
}

/** "Caracas → Mérida": el título de una ruta se dibuja con su flecha, no con un carácter. */
function TituloEntidad({ title }: { title: string }) {
  const partes = title.split(" → ");
  if (partes.length !== 2) {
    return <span className="line-clamp-2 text-[17px] leading-snug font-semibold text-foreground">{title}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[17px] leading-snug font-semibold text-foreground">
      <span className="truncate">{partes[0]}</span>
      <ArrowRight aria-hidden weight="bold" className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{partes[1]}</span>
    </span>
  );
}

const BASE =
  "block min-h-16 w-full rounded-xl bg-card p-4 text-left text-foreground shadow-card outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/50";
const TOCABLE =
  "cursor-pointer transition-[transform,background-color] hover:bg-surface/60 active:bg-surface/60 motion-safe:active:scale-[0.99]";

export function EntityCard({
  title,
  subtitle,
  leading,
  adorno,
  badge,
  meta,
  href,
  onClick,
  chevron,
  lineasSubtitulo = 1,
  etiqueta,
  acciones,
  className,
}: EntityCardProps) {
  const tocable = Boolean(href || onClick);
  const conFlecha = chevron ?? tocable;
  const nombre = etiqueta ?? `${title}${subtitle ? `. ${subtitle}` : ""}`;

  const contenido = (
    <>
      <span className="flex items-center gap-3">
        {leading}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <TituloEntidad title={title} />
          {subtitle && (
            <span
              className="text-[13px] text-muted-foreground"
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lineasSubtitulo,
                overflow: "hidden",
              }}
            >
              {subtitle}
            </span>
          )}
        </span>
        {adorno && <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">{adorno}</span>}
        {conFlecha && <CaretRight aria-hidden weight="bold" className="size-4 shrink-0 text-muted-foreground" />}
      </span>
      {(badge || meta) && (
        <span className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          {badge ?? <span />}
          {meta && (
            <span className="min-w-0 truncate text-[13px] font-medium text-muted-foreground tabular-nums">{meta}</span>
          )}
        </span>
      )}
    </>
  );

  if (acciones) {
    // Contenedor con el fondo y la sombra; el enlace/botón ocupa la parte de arriba.
    const claseInterior = cn(
      "block min-h-16 w-full rounded-xl p-4 text-left text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      tocable && TOCABLE
    );
    const parteSuperior = href ? (
      <Link href={href} aria-label={etiqueta} className={claseInterior}>
        {contenido}
      </Link>
    ) : onClick ? (
      <button type="button" aria-label={etiqueta} onClick={onClick} className={claseInterior}>
        {contenido}
      </button>
    ) : (
      <div className={claseInterior}>{contenido}</div>
    );
    return (
      <div
        role={tocable ? undefined : "group"}
        aria-label={tocable ? undefined : nombre}
        className={cn("flex flex-col rounded-xl bg-card shadow-card", className)}
      >
        {parteSuperior}
        <div data-slot="entity-card-acciones" className="grid gap-2 px-4 pb-4 *:w-full">
          {acciones}
        </div>
      </div>
    );
  }

  const clase = cn(BASE, tocable && TOCABLE, className);

  if (href) {
    return (
      <Link href={href} aria-label={etiqueta} className={clase}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" aria-label={etiqueta} onClick={onClick} className={clase}>
        {contenido}
      </button>
    );
  }
  return (
    <div role="group" aria-label={nombre} className={clase}>
      {contenido}
    </div>
  );
}
