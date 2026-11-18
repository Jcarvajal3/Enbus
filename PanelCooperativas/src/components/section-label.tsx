import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { cn } from "@/lib/utils";

// ─── SectionLabel: título de una sección dentro de la página ─────────────────
// 17 semibold, en frase normal (nunca mayúsculas diminutas). `accion` va a la
// derecha (un enlace o un botón ghost). Usa `nivel` para no saltar niveles de
// encabezado: el H1 es el de `PageHeader`, las secciones son h2. `id` nombra la
// <section> (`aria-labelledby`); `icono` añade un IconTile pequeño con `tono`.

export function SectionLabel({
  children,
  descripcion,
  accion,
  nivel = 2,
  id,
  icono,
  tono = "neutral",
  className,
}: {
  children: ReactNode;
  descripcion?: string;
  accion?: ReactNode;
  nivel?: 2 | 3;
  id?: string;
  icono?: Icon;
  tono?: IconTileTone;
  className?: string;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icono && <IconTile icon={icono} tone={tono} size="sm" />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Titulo id={id} className="font-heading text-[17px] leading-snug font-semibold tracking-tight text-foreground">
            {children}
          </Titulo>
          {descripcion && <p className="text-[13px] text-muted-foreground">{descripcion}</p>}
        </div>
      </div>
      {accion && <div className="flex shrink-0 items-center gap-2">{accion}</div>}
    </div>
  );
}
