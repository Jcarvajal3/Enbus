"use client";

import { useCallback, useEffect, useState } from "react";
import {
  activarPush,
  desactivarPush,
  detectarEstadoPush,
  probarAvisoLocal,
  type EstadoPush,
} from "@/components/push/push-navegador";

// ─── Notificaciones push de este equipo ─────────────────────────────────────
// Estado + acciones para la tarjeta de "Impresora y lector" y la invitación.
// activar() pide el permiso: llamarlo solo desde un clic.

export function usePushPanel() {
  const [estado, setEstado] = useState<EstadoPush>("cargando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    const actualizar = () => {
      void detectarEstadoPush().then((e) => {
        if (vivo) setEstado(e);
      });
    };
    actualizar();
    // El permiso se puede cambiar desde la configuración del navegador con la página abierta.
    const alVolver = () => {
      if (document.visibilityState === "visible") actualizar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  const ejecutar = useCallback(async (accion: () => Promise<{ estado: EstadoPush; error?: string }>) => {
    setOcupado(true);
    try {
      const r = await accion();
      setEstado(r.estado);
      return r;
    } finally {
      setOcupado(false);
    }
  }, []);

  const activar = useCallback(() => ejecutar(activarPush), [ejecutar]);
  const desactivar = useCallback(() => ejecutar(desactivarPush), [ejecutar]);

  return { estado, ocupado, activar, desactivar, probar: probarAvisoLocal };
}
