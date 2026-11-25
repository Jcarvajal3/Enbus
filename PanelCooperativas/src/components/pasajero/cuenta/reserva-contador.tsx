"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ClockCountdown } from "@phosphor-icons/react";
import estilos from "./cuenta-ui.module.css";

/** Al vencer, vuelve a leer la página cada 15 s (como mucho 4 veces): el servidor libera el asiento. */
const RECARGA_MS = 15_000;
const RECARGAS_MAX = 4;

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Segundos que faltan. Parte de la hora del servidor (`ahoraMs`, igual en el HTML y al hidratar) y
 * descuenta el tiempo transcurrido en este navegador, sin depender del reloj del teléfono.
 */
function useSegundosRestantes(expiraAt: string, ahoraMs: number): number {
  const base = Math.max(0, Math.ceil((Date.parse(expiraAt) - ahoraMs) / 1000));
  const [restante, setRestante] = useState(base);
  const inicio = useRef<number | null>(null);

  useEffect(() => {
    inicio.current = performance.now();
    const tick = () => {
      const pasado = Math.floor((performance.now() - (inicio.current ?? 0)) / 1000);
      setRestante(Math.max(0, base - pasado));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [base]);

  return restante;
}

interface Props {
  expiraAt: string;
  /** Hora del servidor (ms) al pintar la página. */
  ahoraMs: number;
  /** "mini" para la tarjeta de la lista; "completo" para el detalle. */
  variante?: "mini" | "completo";
  titulo?: string;
  detalle?: string;
}

/** Cuenta regresiva de una reserva sin pago. `role="timer"`: no se anuncia cada segundo. */
export function ReservaContador({ expiraAt, ahoraMs, variante = "completo", titulo, detalle }: Props) {
  const router = useRouter();
  const restante = useSegundosRestantes(expiraAt, ahoraMs);
  const vencida = restante === 0;
  const recargas = useRef(0);

  useEffect(() => {
    if (!vencida) return;
    const id = setInterval(() => {
      if (recargas.current >= RECARGAS_MAX) return clearInterval(id);
      recargas.current += 1;
      router.refresh();
    }, RECARGA_MS);
    return () => clearInterval(id);
  }, [vencida, router]);

  if (variante === "mini") {
    return (
      <p className={estilos.contadorMini} role="timer">
        <Clock aria-hidden weight="fill" />
        {vencida ? "Reserva vencida" : `Vence en ${mmss(restante)}`}
      </p>
    );
  }

  return (
    <div className={estilos.contador} role="timer" data-vencida={vencida}>
      <ClockCountdown aria-hidden weight="fill" />
      <div>
        {vencida ? (
          <>Se acabó el tiempo. Estamos liberando el asiento…</>
        ) : (
          <>
            {titulo ?? "Tu asiento está apartado"}: vence en <strong>{mmss(restante)}</strong>
            {detalle && <span style={{ display: "block", fontWeight: 500 }}>{detalle}</span>}
          </>
        )}
      </div>
    </div>
  );
}
