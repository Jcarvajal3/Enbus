"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import type { DatosPagoPasajero } from "@/lib/pasajero/pagos-comun";
import type { EntradaPago } from "./servidor";
import type { ResultadoAccion } from "./resultado";

export interface TasaPago {
  tasa: number;
  fecha: string;
}

export interface AvisoTasa {
  totalBs: number;
  totalUsd: number | null;
  tasa: number | null;
  tasaFecha: string | null;
}

/** Errores tras los cuales lo que ve el pasajero ya no es cierto: se avisa y se vuelve a leer la página. */
const CODIGOS_DESACTUALIZADO = new Set(["EB_ASIENTO_OCUPADO", "EB_ESTADO_CAMBIO", "EB_PAGO_YA_REGISTRADO", "EB_NO_ENCONTRADO"]);

interface Opciones {
  tasaInicial: TasaPago | null;
  enviar(entrada: Omit<EntradaPago, never>): Promise<ResultadoAccion<{ repetido: boolean }>>;
  /** El pago quedó registrado (o ya lo estaba). */
  onListo(repetido: boolean): void;
  /** El estado cambió por otro lado: avisar y refrescar. */
  onDesactualizado(mensaje: string): void;
}

/**
 * Estado del reporte de un pago: clave de idempotencia estable por intento, tasa que ve el
 * pasajero y manejo de `EB_TASA_CAMBIO` (se muestra el nuevo total y se pide confirmarlo).
 */
export function useReportePago({ tasaInicial, enviar, onListo, onDesactualizado }: Opciones) {
  const [tasa, setTasa] = useState<TasaPago | null>(tasaInicial);
  const [totalBs, setTotalBs] = useState<number | undefined>(undefined);
  const [aviso, setAviso] = useState<AvisoTasa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();
  const clave = useRef<string | null>(null);
  const ocupado = useRef(false);

  const enviarDatos = useCallback(
    (datos: DatosPagoPasajero) => {
      if (ocupado.current) return;
      ocupado.current = true;
      setError(null);
      clave.current ??= crypto.randomUUID();
      const idempotencyKey = clave.current;
      empezar(async () => {
        try {
          const r = await enviar({ ...datos, tasaEsperada: tasa?.tasa ?? null, idempotencyKey });
          if (r.success) {
            clave.current = null;
            onListo(r.data.repetido);
            return;
          }
          if (r.codigo === "EB_TASA_CAMBIO" && r.detalle && Number(r.detalle.total_bs) > 0) {
            setAviso({
              totalBs: Number(r.detalle.total_bs),
              totalUsd: Number(r.detalle.total_usd) > 0 ? Number(r.detalle.total_usd) : null,
              tasa: Number(r.detalle.tasa) > 0 ? Number(r.detalle.tasa) : null,
              tasaFecha: typeof r.detalle.tasa_fecha === "string" ? r.detalle.tasa_fecha : null,
            });
            return;
          }
          if (r.codigo && CODIGOS_DESACTUALIZADO.has(r.codigo)) {
            clave.current = null;
            onDesactualizado(r.error);
            return;
          }
          setError(r.error);
        } catch {
          setError("No pudimos registrar tu pago. Revisa tu conexión e intenta de nuevo.");
        } finally {
          ocupado.current = false;
        }
      });
    },
    [enviar, onListo, onDesactualizado, tasa]
  );

  /** El pasajero acepta el total nuevo: se actualiza la tasa y puede reportar de nuevo. */
  const confirmarTasa = useCallback(() => {
    if (!aviso) return;
    if (aviso.tasa) setTasa({ tasa: aviso.tasa, fecha: aviso.tasaFecha ?? tasa?.fecha ?? "" });
    setTotalBs(aviso.totalBs);
    setAviso(null);
    setError(null);
  }, [aviso, tasa]);

  return { tasa, totalBs, aviso, error, enviando, enviarDatos, confirmarTasa, descartarAviso: () => setAviso(null) };
}
