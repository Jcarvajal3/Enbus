"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DotsThree, type Icon } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Encabezado único de página (Amanecer) ──────────────────────────────────
// H1 32 semibold con tracking negativo (26 en móvil) + `estado` (StatusBadge
// junto al título) + descripción de 15 en muted + acciones a la derecha. Las
// acciones usan `size="lg"` (48 px): como máximo 1 `default` (el amarillo de la
// vista) + 1 `outline` + menú "Más". La miga vive en la barra superior del shell
// (`MigaObjeto`), no aquí.
//
// ── Regla única de la acción principal (`principal`) ──
//   · Escritorio (≥ md): a la derecha del título, `size="lg"` (48 px).
//   · Móvil (< md): NO va bajo el título. Sale en una barra fija abajo (blanca,
//     a todo el ancho, `size="xl"` = 56 px) sobre la barra de pestañas y el área
//     segura, igual que `BarraAccionFija`. Es UN solo render (el mismo nodo cambia
//     de sitio por CSS), así que un `<CreateXDialog />` con su propio disparador no
//     duplica el diálogo. El espaciador del final del contenido lo pone el shell
//     (`#contenido`, panel y admin) con `:has([data-slot="principal-pagina"])`;
//     quien monte un contenedor propio debe dejar ese mismo hueco inferior.
//   · Si la página ya tiene su propia barra fija (`BarraAccionFija`, `BarraFlujo`)
//     NO uses `principal`: serían dos barras apiladas.
//   · Otras acciones: `secundarias` (datos, no botones): en escritorio son botones
//     outline; en móvil se juntan en un menú "Más" de 44 px bajo el título.
//     `children` (botones sueltos, caso raro) se apilan a ancho completo en móvil.
//   · El título ya sale en la cabecera del shell; aquí el H1 baja a 26 px y la
//     descripción se oculta en móvil (`descripcionMovil` la deja).
//   · Texto del botón: verbo + objeto ("Nueva ruta", "Invitar empleado"); icono
//     Plus para crear y el propio de la acción si es otra (UserPlus…).
//
//   <PageHeader
//     title="Rutas"
//     description="Trayectos que opera tu cooperativa"
//     principal={<Button size="lg" onClick={abrir}><Plus aria-hidden />Nueva ruta</Button>}
//     secundarias={[
//       { etiqueta: "Exportar", icono: DownloadSimple, onClick: exportar },
//       { etiqueta: "Ver tarifas", href: "/cooperativas/tarifas" },
//     ]}
//   />

export type AccionSecundaria = {
  etiqueta: string;
  icono?: Icon;
  onClick?(): void;
  /** Con `href` la acción es un enlace en vez de un botón. */
  href?: string;
  deshabilitada?: boolean;
  /** Tono rojo en el menú móvil (acción que borra o desactiva). */
  destructiva?: boolean;
  /** Solo en escritorio: no entra en el menú "Más" del móvil. */
  soloEscritorio?: boolean;
  /** Muestra un spinner en lugar del icono y bloquea la acción (p. ej. "Actualizar"). */
  cargando?: boolean;
};

interface PageHeaderProps {
  title: string;
  /** Una línea de apoyo en gestión y admin; ninguna en pantallas operativas. Se oculta en móvil. */
  description?: string;
  /** Muestra la descripción también en móvil (por defecto se oculta). */
  descripcionMovil?: boolean;
  /** Insignia de estado junto al título (`<StatusBadge …/>`). */
  estado?: ReactNode;
  /**
   * Acción principal de la página (un Button/Link `size="lg"`). En móvil pasa a la barra
   * fija inferior, a ancho completo y `xl` (forzado por CSS). Puede ser un nodo con su
   * propio disparador (p. ej. un `<CreateXDialog />` que dibuja su botón): se renderiza
   * una sola vez y su primer elemento es el que se estira.
   */
  principal?: ReactNode;
  /** Acciones secundarias: botones outline en escritorio, menú "Más" en móvil. */
  secundarias?: AccionSecundaria[];
  /** Acciones libres (botones `size="lg"`); en móvil se apilan a ancho completo. */
  children?: ReactNode;
}

export function PageHeader({
  title,
  description,
  descripcionMovil = false,
  estado,
  principal,
  secundarias,
  children,
}: PageHeaderProps) {
  const hayAcciones = Boolean(principal || children || (secundarias && secundarias.length > 0));
  // Solo `principal`: en móvil su caja no pinta nada (el botón sale fijo abajo), así que
  // el contenedor no debe dejar un hueco bajo el título.
  const secundariasMovil = secundarias?.filter((a) => !a.soloEscritorio) ?? [];
  const soloPrincipal = Boolean(principal) && !children && secundariasMovil.length === 0;
  return (
    // min-h-12 = alto de un botón lg: el H1 queda a la misma altura con o sin acciones.
    <div className="flex flex-col items-stretch justify-between gap-4 md:min-h-12 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-tight text-foreground md:text-[32px]">
            {title}
          </h1>
          {estado}
        </div>
        {description && (
          <p className={cn("text-[15px] text-muted-foreground", !descripcionMovil && "max-md:hidden")}>{description}</p>
        )}
      </div>
      {hayAcciones && (
        <div
          className={cn(
            "flex flex-col gap-3 max-md:*:w-full md:flex-row md:flex-wrap md:items-center",
            soloPrincipal && "max-md:contents"
          )}
        >
          {secundarias && secundarias.length > 0 && <SecundariasEscritorio acciones={secundarias} />}
          {children}
          {principal && (
            // ≥ md: `contents` (el botón es un hijo más de la fila). Móvil: barra fija inferior; el `!`
            // gana a las clases propias del botón (lg → xl).
            <div
              data-slot="principal-pagina"
              className="md:contents max-md:fixed max-md:inset-x-0 max-md:bottom-[max(var(--alto-pestanas,0px),env(safe-area-inset-bottom))] max-md:z-30 max-md:flex max-md:flex-col max-md:border-t max-md:border-border max-md:bg-card max-md:px-5 max-md:py-3 max-md:shadow-overlay max-md:*:h-14! max-md:*:w-full! max-md:*:px-7! max-md:*:text-base! max-md:*:[&_svg:not([class*='size-'])]:size-5"
            >
              {principal}
            </div>
          )}
          {secundariasMovil.length > 0 && <MenuMas acciones={secundariasMovil} />}
        </div>
      )}
    </div>
  );
}

/** ≥ md: cada secundaria es un botón outline. */
function SecundariasEscritorio({ acciones }: { acciones: AccionSecundaria[] }) {
  return (
    <>
      {acciones.map((a) => {
        const Icono = a.icono;
        const contenido = (
          <>
            {a.cargando ? <Spinner size="sm" aria-hidden /> : Icono && <Icono aria-hidden />}
            {a.etiqueta}
          </>
        );
        return a.href && !a.deshabilitada ? (
          <Link
            key={a.etiqueta}
            href={a.href}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "max-md:hidden")}
          >
            {contenido}
          </Link>
        ) : (
          <Button
            key={a.etiqueta}
            type="button"
            variant="outline"
            size="lg"
            disabled={a.deshabilitada || a.cargando}
            aria-busy={a.cargando || undefined}
            onClick={a.onClick}
            className="max-md:hidden"
          >
            {contenido}
          </Button>
        );
      })}
    </>
  );
}

/** < md: un solo botón "Más" con todas las secundarias. */
function MenuMas({ acciones }: { acciones: AccionSecundaria[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "lg" }), "md:hidden")}>
        <DotsThree weight="bold" aria-hidden />
        Más
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {acciones.map((a) => {
          const Icono = a.icono;
          return (
            <DropdownMenuItem
              key={a.etiqueta}
              disabled={a.deshabilitada || a.cargando}
              variant={a.destructiva ? "destructive" : "default"}
              className="min-h-11 text-[15px]"
              onClick={a.onClick}
              render={a.href ? <Link href={a.href} /> : undefined}
            >
              {a.cargando ? <Spinner size="sm" aria-hidden /> : Icono && <Icono aria-hidden />}
              {a.etiqueta}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
