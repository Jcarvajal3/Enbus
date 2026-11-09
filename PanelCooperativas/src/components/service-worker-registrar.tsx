"use client";

import { useEffect } from "react";
import { InvitacionPush } from "@/components/push/invitacion-push";
import { sincronizarPush } from "@/components/push/push-navegador";

/**
 * Registra el Service Worker en el navegador del usuario.
 * Solo se activa en producción o si la variable NEXT_PUBLIC_SW_ENABLED="true".
 *
 * Se monta en el shell del panel (sesión de personal de una cooperativa). Además:
 * - Si este navegador ya tenía las notificaciones push activadas, vuelve a guardar
 *   la suscripción para la sesión actual (otra persona pudo entrar en el mismo
 *   equipo o el navegador pudo renovarla).
 * - Con el panel instalado, invita una sola vez a activarlas (InvitacionPush).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    const swEnabled = process.env.NEXT_PUBLIC_SW_ENABLED === "true";

    if (!isProd && !swEnabled) {
      // In development, actively unregister any registered service workers for this scope
      // to avoid caching local development chunks and causing hydration mismatches.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (registration.scope.includes("/cooperativas/")) {
            registration.unregister().then((success) => {
              if (success) {
                console.info("[SW] Desregistrado en modo desarrollo para evitar caché persistente.");
              }
            });
          }
        }
      });
      return;
    }

    // Registrar inmediatamente, sin esperar window.load — el SW gestiona su
    // propio ciclo de vida con skipWaiting / clients.claim.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/cooperativas/" })
      .then((registration) => {
        if (process.env.NODE_ENV === "development") {
          console.info("[SW] Registrado con scope:", registration.scope);
        }
        void sincronizarPush(registration);
      })
      .catch(() => {
        // Sin service worker el panel funciona igual: solo se pierde la caché para
        // abrir sin conexión y las notificaciones. No hay nada que la persona pueda
        // hacer, así que no se avisa.
      });
  }, []);

  return <InvitacionPush />;
}
