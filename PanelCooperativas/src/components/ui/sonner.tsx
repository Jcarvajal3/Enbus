"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

// Avisos (SY-08, §2.3): con cierre, icono `fill` en el color del tono, éxito e
// info 3 s. El error persiste: se lanza con `avisarError` (lib/avisos.ts).
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      duration={3000}
      icons={{
        success: <CheckCircleIcon className="size-4 text-success-text" weight="fill" aria-hidden />,
        info: <InfoIcon className="size-4 text-info-text" weight="fill" aria-hidden />,
        warning: <WarningIcon className="size-4 text-warning-text" weight="fill" aria-hidden />,
        error: <XCircleIcon className="size-4 text-destructive-text" weight="fill" aria-hidden />,
        loading: <SpinnerIcon className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-md, 16px)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: "Cerrar",
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
