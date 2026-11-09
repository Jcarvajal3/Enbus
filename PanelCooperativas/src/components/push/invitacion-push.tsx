"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { avisarError, avisarExito } from "@/lib/avisos";
import { activarPush, detectarEstadoPush, esAppInstalada } from "@/components/push/push-navegador";

// ─── Invitación a activar las notificaciones ────────────────────────────────
// Una sola vez por equipo y solo con el panel instalado (ventana propia, donde
// se esperan avisos): un aviso breve con «Activar» y «Ahora no». Nunca pide el
// permiso por su cuenta; si la persona la descarta, sigue disponible en
// "Impresora y lector".

const CLAVE = "enbus.push.invitacion";
const ESPERA_MS = 5000;

function yaInvitado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) !== null;
  } catch {
    return true; // sin almacenamiento no se puede recordar: mejor no insistir
  }
}

function marcarInvitado() {
  try {
    window.localStorage.setItem(CLAVE, new Date().toISOString());
  } catch {
    // modo privado o almacenamiento lleno
  }
}

export function InvitacionPush() {
  useEffect(() => {
    if (!esAppInstalada() || yaInvitado()) return;
    let vivo = true;
    const t = setTimeout(() => {
      void detectarEstadoPush().then((estado) => {
        if (!vivo || estado !== "desactivadas" || Notification.permission !== "default") return;
        marcarInvitado();
        toast.info("¿Te avisamos de los pagos por verificar?", {
          description: "Recibe una notificación en este equipo cuando un cliente reporte un pago.",
          duration: 15000,
          action: {
            label: "Activar",
            onClick: () => {
              void activarPush().then((r) => {
                if (r.error) avisarError(r.error);
                else if (r.estado === "activadas") avisarExito("Listo: este equipo te avisará de los pagos por verificar.");
              });
            },
          },
          cancel: { label: "Ahora no", onClick: () => undefined },
        });
      });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, []);

  return null;
}
