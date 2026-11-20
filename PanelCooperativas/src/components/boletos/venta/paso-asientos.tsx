"use client";

// ─── Paso 2: Elige los asientos ──────────────────────────────────────────────
// El mapa del bus (como el de la app). La selección vive en la venta (`asientos`);
// los ocupados los lee la página al entrar al paso. Si una lectura nueva trae como
// ocupado un asiento ya elegido, se quita de la selección y se avisa (nunca en
// silencio).

import { useEffect, useRef } from "react";
import { SeatSelector } from "../seat-selector";
import { MAX_ASIENTOS_VENTA } from "./tipos";

export function PasoAsientos({
  totalAsientos,
  ocupados,
  error,
  onReintentar,
  seleccion,
  onChange,
  onTomados,
  bloqueado,
}: {
  totalAsientos: number;
  ocupados: ReadonlySet<string> | null;
  error: string | null;
  onReintentar: () => void | Promise<void>;
  seleccion: string[];
  onChange: (asientos: string[]) => void;
  /** Asientos elegidos que otra persona acaba de ocupar (ya hay que quitarlos). */
  onTomados: (asientos: string[]) => void;
  bloqueado: boolean;
}) {
  const seleccionRef = useRef(seleccion);
  const onTomadosRef = useRef(onTomados);
  useEffect(() => {
    seleccionRef.current = seleccion;
    onTomadosRef.current = onTomados;
  });

  useEffect(() => {
    if (!ocupados) return;
    const tomados = seleccionRef.current.filter((a) => ocupados.has(a));
    if (tomados.length > 0) onTomadosRef.current(tomados);
  }, [ocupados]);

  return (
    <SeatSelector
      totalAsientos={totalAsientos}
      ocupados={ocupados}
      seleccion={seleccion}
      onChange={onChange}
      error={error}
      onReintentar={onReintentar}
      maxSeleccion={MAX_ASIENTOS_VENTA}
      bloqueado={bloqueado}
    />
  );
}
