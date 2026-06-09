"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useEncomiendasRealtime(
  cooperativaId: string,
  onUpdate: () => void
) {
  useEffect(() => {
    if (!cooperativaId) return;

    const supabase = createClient();

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
        () => {
          onUpdate();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pagos",
          filter: `cooperativa_id=eq.${cooperativaId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cooperativaId, onUpdate]);
}
