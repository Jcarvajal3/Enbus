"use client";

// ─── Paso 3: ¿Cómo pagas? ────────────────────────────────────────────────────
// Cuentas de la cooperativa (Pago Móvil, Transferencia, Zelle), total en Bs con la tasa BCV del día
// y reporte del pago; o "Apartar y pagar en taquilla". Si la tasa cambió mientras se pagaba, el aviso
// pide aceptar el nuevo total antes de reportar. El botón de acción NO se dibuja aquí: la página lo pone
// en su `BarraFlujo` con lo que informa `onBarra`.

import { AvisoTasaCambio, PagoPasajero, type EstadoBarraPago } from "@/components/pasajero/pago";
import type { DatosPagoPasajero, MetodoPagoPasajero } from "@/lib/pasajero/pagos-comun";
import type { TasaRef } from "@/lib/dinero";

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
  onBarra,
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
  onBarra: (estado: EstadoBarraPago) => void;
}) {
  return (
    <section className="flex flex-col gap-5" aria-label="Pago de tu compra">
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
        onBarra={onBarra}
      />
    </section>
  );
}
