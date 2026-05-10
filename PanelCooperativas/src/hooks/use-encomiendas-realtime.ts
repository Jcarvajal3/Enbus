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

    const channel = supabase
      .channel(`encomiendas-changes-${cooperativaId}`)
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
