import type { ReactNode } from "react";

// ─── Encabezado único de página (#55, AD-03, D15, D16) ──────────────────────
// H1 + `estado` (StatusBadge junto al título) + acciones a la derecha: como
// máximo 1 `default` + 1 `outline` + menú "Más". La miga vive en la barra
// superior del shell (`MigaObjeto`), no aquí.

interface PageHeaderProps {
  title: string;
  /** Una línea ≤ 60 caracteres, solo en gestión y admin (D16); ninguna en pantallas operativas. */
  description?: string;
  /** Insignia de estado junto al título (`<StatusBadge …/>`). */
  estado?: ReactNode;
  /** Acciones de la página. */
  children?: ReactNode;
}

export function PageHeader({ title, description, estado, children }: PageHeaderProps) {
  return (
    // min-h-9 = alto de un botón: el H1 queda a la misma altura con o sin acciones.
    <div className="flex flex-col items-start justify-between gap-4 sm:min-h-9 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {estado}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
