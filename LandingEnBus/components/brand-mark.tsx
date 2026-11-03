import { cn } from "@/lib/utils"

/**
 * Marca EnBus (D6 de Audits/fase5/fase5_spec.md), igual en app, panel y landing:
 * bloque cuadrado `primary` con "EB" en `ink` 800, radio = 30 % del lado y letra
 * al 42 % del lado; a su lado, "EnBus". Fuente gráfica: shared/marca/eb.svg.
 */
const TAMANOS = {
  sm: { bloque: "size-8 rounded-[9.6px] text-[13.44px]", nombre: "text-lg" }, // 32 px
  md: { bloque: "size-10 rounded-[12px] text-[16.8px]", nombre: "text-xl" }, // 40 px
  lg: { bloque: "size-12 rounded-[14.4px] text-[20.16px]", nombre: "text-2xl" }, // 48 px
} as const

interface BrandMarkProps {
  tamano?: keyof typeof TAMANOS
  /** Muestra "EnBus" junto al bloque (el color del nombre se hereda del contenedor). */
  conNombre?: boolean
  /** Versión inversa (bloque ink, "EB" amarillo): solo sobre fondos `primary`, donde el bloque no se vería. */
  invertido?: boolean
  className?: string
}

export function BrandMark({ tamano = "sm", conNombre = false, invertido = false, className }: BrandMarkProps) {
  const t = TAMANOS[tamano]
  const bloque = (
    <span
      aria-hidden={conNombre || undefined}
      role={conNombre ? undefined : "img"}
      aria-label={conNombre ? undefined : "EnBus"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none font-extrabold tracking-[-0.01em] select-none",
        invertido ? "bg-foreground text-primary" : "bg-primary text-primary-foreground",
        t.bloque,
        !conNombre && className
      )}
    >
      EB
    </span>
  )
  if (!conNombre) return bloque
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {bloque}
      <span className={cn("leading-none font-bold tracking-tight", t.nombre)}>EnBus</span>
    </span>
  )
}
