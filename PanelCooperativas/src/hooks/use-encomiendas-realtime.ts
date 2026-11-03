"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Espera tras el último cambio antes de recargar. En una cooperativa con mucho
 * movimiento llegan ráfagas (un despacho de 40 encomiendas = 40 eventos, más el
 * historial): sin esto cada pantalla abierta recargaba la lista 40 veces seguidas.
 */
const ESPERA_MS = 700;

/**
 * Recarga la pantalla cuando cambian las encomiendas o los pagos de la cooperativa.
 * - Un solo canal por pantalla montada, cerrado al desmontar.
 * - `onUpdate` puede cambiar sin volver a crear el canal (se guarda en una ref).
 * - Los eventos se agrupan (`ESPERA_MS`).
 * - Si el canal se cae y se vuelve a conectar (red, suspensión del equipo), se
 *   recarga una vez: los cambios de mientras no llegan como eventos.
 */
export function useEncomiendasRealtime(
  cooperativaId: string,
  onUpdate: () => void
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!cooperativaId) return;

    const supabase = createClient();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let activo = true;
    let yaSuscrito = false;

    const programarRecarga = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        if (activo) onUpdateRef.current();
      }, ESPERA_MS);
    };

    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase
      .channel(`encomiendas-changes-${cooperativaId}-${uniqueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "encomiendas",
          filter: `cooperativa_id=eq.${cooperativaId}`,
        },
        programarRecarga
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pagos",
          filter: `cooperativa_id=eq.${cooperativaId}`,
        },
        programarRecarga
      )
      .subscribe((status: string) => {
        if (status !== "SUBSCRIBED") return;
        // La primera suscripción no recarga (la pantalla ya cargó al montar).
        if (yaSuscrito) programarRecarga();
        yaSuscrito = true;
      });

    return () => {
      activo = false;
      clearTimeout(temporizador);
      void supabase.removeChannel(channel);
    };
  }, [cooperativaId]);
}
