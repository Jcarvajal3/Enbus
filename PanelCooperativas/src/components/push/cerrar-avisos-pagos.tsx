"use client";

import { useEffect } from "react";

// ─── Cerrar los avisos de pagos al ver la bandeja ───────────────────────────
// Montado en "Pagos por verificar": al abrirla (o volver a ella) se cierran las
// notificaciones push de pagos de este equipo. La bandeja ya muestra lo que
// queda pendiente, y así el siguiente aviso agrupado del service worker no
// suma pagos que se resolvieron aquí.

const TAG = "pagos-por-verificar"; // mismo tag que manda push-panel

function cerrarAvisos() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration("/cooperativas/")
    .then((reg) => reg?.getNotifications({ tag: TAG }))
    .then((avisos) => avisos?.forEach((n) => n.close()))
    .catch(() => undefined);
}

export function CerrarAvisosPagos() {
  useEffect(() => {
    cerrarAvisos();
    const alVolver = () => {
      if (document.visibilityState === "visible") cerrarAvisos();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  return null;
}
