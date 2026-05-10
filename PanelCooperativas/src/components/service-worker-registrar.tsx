"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker en el navegador del usuario.
 * Solo se activa en producción o si la variable NEXT_PUBLIC_SW_ENABLED="true".
 *
 * Se renderiza como un componente vacío (sin output visual) para que pueda
 * colocarse en layouts Server Components sin necesidad de "use client" en ellos.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Registrar inmediatamente, sin esperar window.load — el SW gestiona su
    // propio ciclo de vida con skipWaiting / clients.claim.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/cooperativas/" })
      .then((registration) => {
        if (process.env.NODE_ENV === "development") {
          console.info("[SW] Registrado con scope:", registration.scope);
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SW] Error al registrar:", err);
        }
      });
  }, []);

  return null;
}
