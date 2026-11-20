"use client";

// ─── useSalidaProtegida: no perder lo escrito por error ─────────────────────
// Equivalente web de la parte "paso 1 con datos" de `useWizardBack`: con
// `activo` (hay datos que se perderían) pide confirmar antes de salir:
//   · recargar / cerrar la pestaña / ir a otro sitio  → `beforeunload` nativo;
//   · clic en cualquier enlace interno (sidebar, miga, logo) → diálogo propio;
//   · la flecha ← del primer paso → `confirmarSalida(accion)`.
// Con `bloqueado` (petición en curso) no se puede salir de ninguna forma.
//
//   const { dialogo, confirmarSalida, permitirSalida } = useSalidaProtegida({
//     activo: hayDatos,
//     bloqueado: enviando,
//   });
//   const atras = () => (indice > 0 ? anterior() : confirmarSalida(() => router.push(volver)));
//   …
//   // tras registrar con éxito, antes de navegar:
//   permitirSalida();
//   router.replace("/cooperativas/taquilla");
//   …
//   return (<>{dialogo}<FlujoPagina … /></>);
//
// Limitación: el botón "atrás" del NAVEGADOR dentro de la app (no recarga la
// página) no se puede interceptar de forma fiable; para eso el flujo usa
// `usePasoEnUrl` (atrás = paso anterior) y el diálogo cubre ← y los enlaces.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type SalidaProtegida = {
  /** Renderízalo una vez en la página (es el diálogo "¿Salir sin terminar?"). */
  dialogo: ReactNode;
  /**
   * Ejecuta `accion` (navegar fuera) tras confirmar. Sin datos (`activo` falso)
   * la ejecuta de inmediato; con `bloqueado` no hace nada.
   */
  confirmarSalida: (accion: () => void) => void;
  /** Desactiva la protección (llamar justo antes de navegar tras completar con éxito). */
  permitirSalida: () => void;
};

export function useSalidaProtegida({
  activo,
  bloqueado = false,
}: {
  /** Hay datos ingresados que se perderían al salir. */
  activo: boolean;
  /** Hay una operación en curso: no se puede salir (ni confirmando). */
  bloqueado?: boolean;
}): SalidaProtegida {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const pendiente = useRef<(() => void) | null>(null);
  const permitido = useRef(false);
  const estado = useRef({ activo, bloqueado });

  useEffect(() => {
    estado.current = { activo, bloqueado };
    // Nuevos datos tras una salida permitida (p. ej. "Vender otro"): protege de nuevo.
    if (activo) permitido.current = false;
  }, [activo, bloqueado]);

  const pedir = useCallback((accion: () => void) => {
    pendiente.current = accion;
    setAbierto(true);
  }, []);

  const confirmarSalida = useCallback(
    (accion: () => void) => {
      if (estado.current.bloqueado) return;
      if (!estado.current.activo || permitido.current) {
        accion();
        return;
      }
      pedir(accion);
    },
    [pedir]
  );

  const permitirSalida = useCallback(() => {
    permitido.current = true;
  }, []);

  // Recargar, cerrar o salir a otro sitio.
  useEffect(() => {
    if (!activo && !bloqueado) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      if (!bloqueado && permitido.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [activo, bloqueado]);

  // Enlaces internos (captura: corre antes que el `Link` de Next).
  useEffect(() => {
    if (!activo && !bloqueado) return;
    const alHacerClic = (e: MouseEvent) => {
      if (!bloqueado && permitido.current) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const origen = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(origen instanceof HTMLAnchorElement)) return;
      if ((origen.target && origen.target !== "_self") || origen.hasAttribute("download")) return;
      let destino: URL;
      try {
        destino = new URL(origen.href, window.location.href);
      } catch {
        return;
      }
      // Otros sitios: lo cubre `beforeunload`. Mismo documento (solo #hash): no se sale.
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      if (bloqueado) return;
      const ruta = `${destino.pathname}${destino.search}${destino.hash}`;
      pedir(() => router.push(ruta));
    };
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, [activo, bloqueado, pedir, router]);

  const dialogo = (
    <ConfirmDialog
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente);
        if (!siguiente) pendiente.current = null;
      }}
      titulo="¿Salir sin terminar?"
      descripcion="Perderás los datos que ingresaste."
      verbo="Salir sin guardar"
      textoCancelar="Seguir aquí"
      onConfirm={async () => {
        const accion = pendiente.current;
        pendiente.current = null;
        permitido.current = true;
        accion?.();
        return { ok: true };
      }}
    />
  );

  return { dialogo, confirmarSalida, permitirSalida };
}
