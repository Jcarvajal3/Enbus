import { cn } from "@/lib/utils";

// ─── Marca EnBus (D6) ─────────────────────────────────────────────────────────
// Bloque "EB" cuadrado: texto `ink` (primary-foreground) 800 sobre `primary`,
// radio = 30 % del lado y fuente = 42 % del lado. Misma geometría que la app y
// la landing. Con `conNombre`, "EnBus" y debajo la zona. `sobrePrimario`: para
// ponerla sobre un fondo `primary` (panel de marca del login): el bloque se
// invierte (amarillo sobre tinta) y el nombre va en tinta en ambos temas.

const LADO = { sm: 32, md: 40, lg: 48 } as const;
const NOMBRE = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

export function BrandMark({
  tamano = "md",
  conNombre = false,
  zona,
  sobrePrimario = false,
  className,
}: {
  tamano?: "sm" | "md" | "lg";
  conNombre?: boolean;
  zona?: "Cooperativas" | "Administración";
  sobrePrimario?: boolean;
  className?: string;
}) {
  const lado = LADO[tamano];
  const bloque = (
    <span
      aria-hidden={conNombre || undefined}
      role={conNombre ? undefined : "img"}
      aria-label={conNombre ? undefined : "EnBus"}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-extrabold leading-none tracking-tight",
        sobrePrimario ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
      )}
      style={{ width: lado, height: lado, borderRadius: lado * 0.3, fontSize: Math.round(lado * 0.42) }}
    >
      EB
    </span>
  );

  if (!conNombre) return <span className={cn("inline-flex", className)}>{bloque}</span>;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      {bloque}
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            "truncate font-semibold tracking-tight",
            sobrePrimario ? "text-primary-foreground" : "text-foreground",
            NOMBRE[tamano]
          )}
        >
          EnBus
        </span>
        {zona && (
          <span className={cn("truncate text-xs", sobrePrimario ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {zona}
          </span>
        )}
      </span>
    </span>
  );
}
