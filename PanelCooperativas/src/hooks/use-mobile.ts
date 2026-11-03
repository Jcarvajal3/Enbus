import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Desde este ancho el menú lateral se abre por defecto; por debajo queda en iconos (PN-18). */
export const MENU_ABIERTO_DESDE = 1280

function suscribirMedia(consulta: string) {
  return (avisar: () => void) => {
    const mql = window.matchMedia(consulta)
    mql.addEventListener("change", avisar)
    return () => mql.removeEventListener("change", avisar)
  }
}

/**
 * true mientras la ventana cumpla `(min-width: px)`. En el servidor (y en la
 * hidratación) devuelve `servidor`; después, el valor real sin desajustes.
 */
export function useAnchoMinimo(px: number, servidor = false): boolean {
  const consulta = `(min-width: ${px}px)`
  const suscribir = React.useMemo(() => suscribirMedia(consulta), [consulta])
  return React.useSyncExternalStore(
    suscribir,
    () => window.matchMedia(consulta).matches,
    () => servidor
  )
}

export function useIsMobile() {
  return !useAnchoMinimo(MOBILE_BREAKPOINT, true)
}
