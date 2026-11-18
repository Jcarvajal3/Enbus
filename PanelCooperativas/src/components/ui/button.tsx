import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-[15px] font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:border-transparent disabled:bg-surface-dark disabled:text-muted-foreground disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:bg-surface-dark aria-disabled:text-muted-foreground aria-disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Acción principal: amarillo + tinta (D1). Una por vista o diálogo.
        default: "bg-primary text-primary-foreground shadow-sun hover:bg-primary/85",
        outline:
          "border-input-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        // Secundario neutro (PU-05): nunca naranja.
        secondary:
          "bg-surface text-foreground hover:bg-surface-dark aria-expanded:bg-surface-dark",
        // Solo para iconos de fila y acciones terciarias.
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted",
        // Sólido, ≥ 6:1 en claro y en oscuro (PU-04, SY-24).
        destructive:
          "bg-destructive-text text-background hover:bg-destructive-text/90 focus-visible:border-destructive-text focus-visible:ring-destructive-text/30",
        // Enlace (SY-20, D1): info-text, subrayado al pasar o enfocar.
        link: "text-info-text font-medium underline-offset-4 hover:underline focus-visible:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-12 gap-2 px-6 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // Acción principal de taquilla (cobrar, emitir): la más grande de la vista.
        xl: "h-14 gap-2.5 px-7 text-base has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
