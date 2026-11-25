"use client";

// ─── Paso 3: paga tu boleto ──────────────────────────────────────────────────
// Cuentas de la cooperativa (Pago Móvil, Transferencia, Zelle), total en Bs con la tasa BCV del día
// y reporte del pago; o "Apartar y pagar en taquilla". Si la tasa cambió mientras se pagaba, el aviso
// pide aceptar el nuevo total antes de reportar.

import { AvisoTasaCambio, PagoPasajero } from "@/components/pasajero/pago";
import type { DatosPagoPasajero, MetodoPagoPasajero } from "@/lib/pasajero/pagos-comun";
import type { TasaRef } from "@/lib/dinero";
import s from "./compra.module.css";

export interface TasaCambiada {
  totalBs: number;
  totalUsd: number | null;
  tasa: number;
  tasaFecha: string | null;
}

export function PasoPago({
  metodos,
  totalUsd,
  totalBs,
  tasa,
  enviando,
  error,
  tasaCambiada,
  onEnviar,
  onTaquilla,
  onConfirmarTasa,
  onDescartarTasa,
}: {
  metodos: MetodoPagoPasajero[];
  totalUsd: number;
  totalBs: number | null;
  tasa: TasaRef | null;
  enviando: boolean;
  error: string | null;
  tasaCambiada: TasaCambiada | null;
  onEnviar: (datos: DatosPagoPasajero) => void;
  onTaquilla: () => void;
  onConfirmarTasa: () => void;
  onDescartarTasa: () => void;
}) {
  return (
    <section className={s.tarjeta} aria-label="Pago de tu compra">
      {tasaCambiada && (
        <AvisoTasaCambio
          totalBs={tasaCambiada.totalBs}
          totalUsd={tasaCambiada.totalUsd}
          tasa={tasaCambiada.tasa}
          tasaFecha={tasaCambiada.tasaFecha}
          cargando={enviando}
          onConfirmar={onConfirmarTasa}
          onCancelar={onDescartarTasa}
        />
      )}
      <PagoPasajero
        metodos={metodos}
        totalUsd={totalUsd}
        totalBs={totalBs ?? undefined}
        tasa={tasa}
        permitirTaquilla
        enviando={enviando}
        error={error}
        onEnviar={onEnviar}
        onTaquilla={onTaquilla}
      />
    </section>
  );
}
