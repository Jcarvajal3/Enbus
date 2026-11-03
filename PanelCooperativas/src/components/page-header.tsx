import type { ReactNode } from "react";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

// ─── Encabezado único de página (#55, AD-03, D15, D16) ──────────────────────
// H1 + `estado` (StatusBadge junto al título) + acciones a la derecha: como
// máximo 1 `default` + 1 `outline` + menú "Más". La miga vive en la barra
// superior del shell (`MigaObjeto`), no aquí.

interface PageHeaderProps {
  title: string;
  /**
   * Una línea ≤ 60 caracteres, solo en gestión y admin (D16); ninguna en
   * pantallas operativas. Un nodo se sigue aceptando para no romper los usos
   * actuales (la oleada 2 pasa a texto).
   */
  description?: string | ReactNode;
  /** Insignia de estado junto al título (`<StatusBadge …/>`). */
  estado?: ReactNode;
  /** Acciones de la página. */
  children?: ReactNode;
  /** @deprecated D15: usar <MigaObjeto> */
  migas?: Array<{ label: string; href?: string }>;
}

export function PageHeader({ title, description, estado, children, migas }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {migas.map((miga, i) => {
              const ultima = i === migas.length - 1;
              return (
                <li key={`${i}-${miga.label}`} className="inline-flex min-w-0 items-center gap-1.5">
                  {i > 0 && <CaretRight className="size-3.5 shrink-0" aria-hidden />}
                  {miga.href ? (
                    <Link
                      href={miga.href}
                      className="truncate rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {miga.label}
                    </Link>
                  ) : (
                    <span className="truncate text-foreground" aria-current={ultima ? "page" : undefined}>
                      {miga.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {estado}
          </div>
          {description &&
            (typeof description === "string" ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : (
              <div className="text-sm text-muted-foreground">{description}</div>
            ))}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
