"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lista horizontal de la tira de fechas. Al montar (y al cambiar de día) centra el día elegido
 * dentro de su propio contenedor, sin mover la página (por eso no usa `scrollIntoView`).
 */
export function ListaFechas({ className, fecha, children }: { className: string; fecha: string; children: ReactNode }) {
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = lista.current;
    const actual = el?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el || !actual) return;
    const a = actual.getBoundingClientRect();
    const l = el.getBoundingClientRect();
    el.scrollLeft += a.left - l.left - (l.width - a.width) / 2;
  }, [fecha]);

  return (
    <ul ref={lista} className={className}>
      {children}
    </ul>
  );
}
