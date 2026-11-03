"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Pestaña activa guardada en `?tab=` (AD-14): volver atrás o compartir el enlace
 * conserva la pestaña. Un valor desconocido usa la primera.
 */
export function useTabEnUrl<T extends string>(validas: readonly T[], porDefecto: T): [T, (v: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actual = searchParams.get("tab");
  const tab = (validas as readonly string[]).includes(actual ?? "") ? (actual as T) : porDefecto;

  const cambiar = useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v === porDefecto) params.delete("tab");
      else params.set("tab", v);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, porDefecto]
  );

  return [tab, cambiar];
}
