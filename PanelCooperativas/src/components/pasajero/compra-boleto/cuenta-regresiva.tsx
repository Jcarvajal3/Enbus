"use client";

// ─── Cuenta regresiva de la reserva ──────────────────────────────────────────
// Vencimiento (`reserva_expira_at`) contra la hora del servidor: `offsetMs = server_now - Date.now()`
// de la última respuesta, así un reloj mal puesto no adelanta ni atrasa el aviso. Vive en su propio
// componente: solo él se vuelve a pintar cada segundo.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ClockIcon } from "@phosphor-icons/react";
import { formatCuentaAtras } from "./tipos";
import s from "./compra.module.css";

const suscribir = (aviso: () => void) => {
  const id = window.setInterval(aviso, 1000);
  return () => window.clearInterval(id);
};
const segundoActual = () => Math.floor(Date.now() / 1000);

export function CuentaRegresiva({
  expiraAt,
  offsetMs,
  onVence,
  etiqueta = "Tu reserva vence en",
}: {
  expiraAt: string;
  offsetMs: number;
  /** Se llama una vez al llegar a 0. */
  onVence?: () => void;
  etiqueta?: string;
}) {
  const ahora = useSyncExternalStore(suscribir, segundoActual, () => 0);
  const fin = Date.parse(expiraAt);
  const restantes = Number.isNaN(fin) || ahora === 0 ? null : Math.max(0, Math.ceil((fin - (ahora * 1000 + offsetMs)) / 1000));

  const avisada = useRef(false);
  const alVencer = useRef(onVence);
  useEffect(() => {
    alVencer.current = onVence;
  });
  useEffect(() => {
    avisada.current = false;
  }, [expiraAt]);
  useEffect(() => {
    if (restantes === 0 && !avisada.current) {
      avisada.current = true;
      alVencer.current?.();
    }
  }, [restantes]);

  if (restantes === null) return null;
  const urgente = restantes <= 300;
  return (
    <p className={s.cuenta} data-urgente={urgente || undefined}>
      <ClockIcon aria-hidden weight="bold" />
      <span>
        {etiqueta}{" "}
        <strong className="s-num" role="timer" aria-live="off">
          {formatCuentaAtras(restantes)}
        </strong>
      </span>
    </p>
  );
}
