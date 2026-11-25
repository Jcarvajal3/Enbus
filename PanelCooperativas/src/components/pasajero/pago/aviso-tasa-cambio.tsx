"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd } from "@/lib/dinero";

export interface AvisoTasaCambioProps {
  /** Nuevo total que devolvió el servidor (`details.total_bs`). */
  totalBs: number;
  totalUsd?: number | null;
  /** Nueva tasa (`details.tasa`) y su fecha 'YYYY-MM-DD' (`details.tasa_fecha`). */
  tasa?: number | null;
  tasaFecha?: string | null;
  /** El pasajero acepta el nuevo total: quien lo usa actualiza la tasa y deja reportar de nuevo. */
  onConfirmar(): void;
  /** Opcional: "Cancelar" para quedarse con el formulario sin cambios. */
  onCancelar?(): void;
  cargando?: boolean;
}

/** Aviso de `EB_TASA_CAMBIO`: muestra el nuevo total y pide confirmarlo antes de reportar el pago. */
export function AvisoTasaCambio({
  totalBs,
  totalUsd,
  tasa,
  tasaFecha,
  onConfirmar,
  onCancelar,
  cargando = false,
}: AvisoTasaCambioProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-light p-4 text-warning-deep"
    >
      <div className="flex items-start gap-2">
        <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
        <div className="min-w-0 flex-1 text-[15px]">
          <p className="font-semibold">La tasa BCV se actualizó</p>
          <p>
            El nuevo total es <strong className="tabular-nums">{formatBs(totalBs)}</strong>
            {totalUsd != null && <span className="tabular-nums"> (≈ {formatUsd(totalUsd)})</span>}
            {tasa ? (
              <span className="tabular-nums">
                {" "}
                a Bs {formatNumeroVE(tasa, 4)} por USD{tasaFecha ? ` · BCV ${fechaTasaCorta(tasaFecha)}` : ""}
              </span>
            ) : null}
            . Revisa el monto antes de reportar tu pago.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onConfirmar} disabled={cargando}>
          Aceptar nuevo total
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
