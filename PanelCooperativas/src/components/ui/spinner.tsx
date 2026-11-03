import { cn } from "@/lib/utils"
import { SpinnerIcon } from "@phosphor-icons/react"

interface SpinnerProps extends React.ComponentProps<"svg"> {
  size?: "sm" | "md" | "lg" | number
}

function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
  }
  const sizeClass = typeof size === "string" ? sizeClasses[size] : undefined
  const iconSize = typeof size === "number" ? size : undefined

  return (
    <SpinnerIcon
      role="status"
      aria-label="Cargando"
      className={cn("motion-safe:animate-spin", sizeClass, className)}
      size={iconSize}
      {...props}
    />
  )
}

export { Spinner }
