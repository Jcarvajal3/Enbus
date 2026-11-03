"use client";

// ─── Marcar salida y Marcar llegada (Viajes, hoja del viaje y Despacho) ──────
// Confirmaciones con `ConfirmDialog` (D3): "Marcar salida" / "Marcar llegada"
// y "Cancelar" para salir sin hacer nada (SY-25). El error se ve dentro.

import { ConfirmDialog, type ResultadoConfirmacion } from "@/components/confirm-dialog";
import { requireOnline } from "@/components/connectivity-banner";
import { completarViaje, marcarSalidaViaje } from "@/app/cooperativas/(panel)/viajes/actions";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { formatHoraVE } from "@/lib/fechas";
import type { SalidaViaje } from "@/lib/types/pagos";

export type ViajeParaSalida = { id: string; origen: string; destino: string; salida: string };

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "Caracas → Valencia · 2:30 p. m." */
export function identidadViaje(v: { origen: string | null | undefined; destino: string | null | undefined; salida: string }) {
  return `${formatCiudad(v.origen)} → ${formatCiudad(v.destino)} · ${formatHoraVE(v.salida)}`;
}

/**
 * Confirmación de "Marcar salida". Cierra la venta de boletos de esa salida y
 * libera las reservas sin pagar (fn_marcar_salida_viaje).
 */
export function MarcarSalidaDialog({
  viaje,
  open,
  onOpenChange,
  onHecho,
}: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: (r: SalidaViaje) => void;
}) {
  const confirmar = async (): Promise<ResultadoConfirmacion> => {
    if (!viaje) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    try {
      const res = await requireOnline(() => marcarSalidaViaje(viaje.id))();
      if (!res.success) return { ok: false, error: res.error };
      if (res.data.ya_procesado) {
        avisarInfo("Este viaje ya estaba marcado como salido.");
      } else {
        const r = res.data.reservas_liberadas ?? 0;
        const p = res.data.pagos_en_verificacion ?? 0;
        const liberadas = r > 0 ? ` ${plural(r, "Se liberó 1 reserva sin pagar.", "Se liberaron {n} reservas sin pagar.")}` : "";
        const pendientes = p > 0 ? ` ${plural(p, "Queda 1 pago por verificar.", "Quedan {n} pagos por verificar.")}` : "";
        avisarExito(`Salida registrada.${liberadas}${pendientes}`);
      }
      onHecho?.(res.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "marcar la salida del viaje") };
    }
  };

  return (
    <ConfirmDialog
      open={open && viaje !== null}
      onOpenChange={onOpenChange}
      titulo={viaje ? `¿Ya salió el bus ${identidadViaje(viaje)}?` : "¿Ya salió el bus?"}
      impacto={["Se cierra la venta de boletos de esta salida.", "Se liberan las reservas sin pagar."]}
      verbo="Marcar salida"
      verboCargando="Registrando…"
      onConfirm={confirmar}
    />
  );
}

/** Confirmación de "Marcar llegada" (viaje EN_CURSO → COMPLETADO). */
export function MarcarLlegadaDialog({
  viaje,
  open,
  onOpenChange,
  onHecho,
}: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: () => void;
}) {
  const confirmar = async (): Promise<ResultadoConfirmacion> => {
    if (!viaje) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    try {
      const res = await requireOnline(() => completarViaje(viaje.id))();
      if (!res.success) return { ok: false, error: res.error };
      if (res.data.ya_procesado) {
        avisarInfo("Este viaje ya estaba completado.");
      } else {
        const n = res.data.no_embarcados ?? 0;
        avisarExito(
          n > 0 ? `Viaje completado. ${plural(n, "1 pasajero no embarcó.", "{n} pasajeros no embarcaron.")}` : "Viaje completado."
        );
      }
      onHecho?.();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "marcar la llegada del viaje") };
    }
  };

  return (
    <ConfirmDialog
      open={open && viaje !== null}
      onOpenChange={onOpenChange}
      titulo={viaje ? `¿Ya llegó el bus ${identidadViaje(viaje)}?` : "¿Ya llegó el bus?"}
      impacto={["El viaje queda como «Completado».", "Los pasajeros que no embarcaron quedan registrados."]}
      verbo="Marcar llegada"
      verboCargando="Registrando…"
      onConfirm={confirmar}
    />
  );
}
