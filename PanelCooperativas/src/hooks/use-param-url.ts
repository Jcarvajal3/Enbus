"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// ─── Estado en la URL (§2.1 regla 5) ────────────────────────────────────────
// Filtros, pestañas y objetos abiertos viven en la URL (`?estado=`, `?q=`,
// `?id=`…): se comparten, sobreviven a recargar y "Atrás" funciona.
//
//   const [estado, setEstado] = useParamUrl("estado", "todos");
//
// `setEstado(null)` o `setEstado(defecto)` quita el parámetro. Cambiar un
// filtro vuelve a la primera página (borra `?pagina=`). Usa `router.replace`
// sin mover el scroll. Quien lo use necesita un <Suspense> por encima si la
// ruta se prerenderiza (useSearchParams).

/** Parámetro que guarda la página de una tabla (`usePaginacion`). */
export const PARAM_PAGINA = "pagina";

/** Aplica cambios a la query actual y navega con `replace` (sin scroll). */
export function useCambiarParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (cambios: Record<string, string | null>, { conservarPagina = false }: { conservarPagina?: boolean } = {}) => {
      // Se parte de la URL real: dos cambios seguidos no se pisan.
      const actual =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") actual.delete(clave);
        else actual.set(clave, valor);
      }
      if (!conservarPagina && !(PARAM_PAGINA in cambios)) actual.delete(PARAM_PAGINA);
      const qs = actual.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );
}

export function useParamUrl(param: string, defecto = ""): [string, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const cambiar = useCambiarParams();
  const valor = searchParams.get(param) ?? defecto;

  const setValor = useCallback(
    (v: string | null) => {
      cambiar({ [param]: v === null || v === defecto ? null : v });
    },
    [cambiar, param, defecto]
  );

  return [valor, setValor];
}
