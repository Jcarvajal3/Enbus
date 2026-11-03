import type { ReactNode } from "react";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

// ─── Encabezado único de página (#55, AD-03) ─────────────────────────────────
// Un solo estilo de H1 en el panel y el admin. `migas` dibuja la ruta encima
// del título ("Cooperativas › Expresos del Táchira"): las migas con `href` son
// enlaces y la última sin `href` es la página actual.

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  migas?: Array<{ label: string; href?: string }>;
}

export function PageHeader({ title, description, children, migas }: PageHeaderProps) {
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description &&
            (typeof description === "string" ? (
              <p className="text-muted-foreground">{description}</p>
            ) : (
              <div className="text-muted-foreground">{description}</div>
            ))}
        </div>
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
