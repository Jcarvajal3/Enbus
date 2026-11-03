"use client";

// ─── Impresora del mostrador (#53, PC-51) ────────────────────────────────────
// Estado de la impresora Bluetooth para cualquier pantalla. Al montarse intenta
// reconectar la impresora guardada en este equipo (sin abrir el selector), así el
// taquillero no tiene que pasar por "Impresora y lector" cada vez que abre el panel.
// Se monta en taquilla de boletos, taquilla de encomiendas e "Impresora y lector".

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  IMPRESORA_SERVIDOR,
  mensajeErrorImpresora,
  printer,
  type EstadoImpresora,
} from "@/lib/printing/bluetooth";

export type { EstadoImpresora };

const servidor = () => IMPRESORA_SERVIDOR;

export function useImpresora(): {
  estado: EstadoImpresora;
  /** Nombre de la impresora guardada en este equipo (aunque no esté conectada). */
  nombre: string | null;
  /** Abre el selector del navegador (requiere un clic). true si quedó conectada. */
  conectar(): Promise<boolean>;
  /** Reconecta la impresora guardada sin selector. true si quedó conectada. */
  reconectar(): Promise<boolean>;
} {
  const { estado, nombre } = useSyncExternalStore(printer.suscribir, printer.estadoActual, servidor);

  useEffect(() => {
    // Reconexión silenciosa al abrir la pantalla: si no se puede, queda "Sin conectar".
    void printer.reconectar();
  }, []);

  const conectar = useCallback(async () => {
    try {
      const { name } = await printer.pair();
      toast.success(`Impresora conectada: ${name}.`);
      return true;
    } catch (err) {
      const mensaje = mensajeErrorImpresora(err);
      if (mensaje) toast.error(mensaje);
      return false;
    }
  }, []);

  const reconectar = useCallback(() => printer.reconectar(), []);

  return { estado, nombre, conectar, reconectar };
}
