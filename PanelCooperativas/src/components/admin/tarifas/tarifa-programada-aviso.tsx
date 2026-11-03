"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cancelarTarifaProgramada } from "@/app/admin/(panel)/tarifas/actions";
import { avisarExito } from "@/lib/avisos";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaProgramada, type Tarifa } from "@/lib/types/admin-tarifas";
import { cn } from "@/lib/utils";

/** "Programada para el 05/10 a las 6:00 a. m." con "Cancelar programación" (fn_cancelar_tarifa_programada). */
export function TarifaProgramadaAviso({
  tarifa,
  actual = null,
  className,
}: {
  tarifa: Tarifa;
  /** Tarifa vigente, para resumir qué cambia. */
  actual?: Tarifa | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cuando = formatFechaProgramada(tarifa.vigente_desde);
  // La tarea programada corre cada 5 minutos: una fecha pasada se activa en breve.
  const [vencida] = useState(() => new Date(tarifa.vigente_desde).getTime() < Date.now());

  return (
    <div className={cn("flex flex-col gap-3 rounded-md bg-info-light p-4 text-sm text-info-deep", className)}>
      <div className="flex items-start gap-2">
        <CalendarCheck className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Programada para el {cuando}</p>
          <p className="tabular-nums">
            Precio por kilo {formatUsd(tarifa.tarifa_por_kg)}
            {actual && actual.tarifa_por_kg !== tarifa.tarifa_por_kg ? ` (hoy ${formatUsd(actual.tarifa_por_kg)})` : ""} ·
            recargo por minuto {formatNumeroVE(tarifa.factor_distancia_por_min, 4)} · hasta{" "}
            {formatNumeroVE(tarifa.peso_max_kg, 1)} kg y {formatNumeroVE(tarifa.dimensiones_max_cm, 0)} cm.
          </p>
          {tarifa.nota && <p>Nota: {tarifa.nota}</p>}
          {vencida && <p className="font-medium">Su hora ya llegó: se activará en los próximos minutos.</p>}
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
        <XCircle aria-hidden /> Cancelar programación
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        titulo="¿Cancelar la tarifa programada?"
        descripcion={`La tarifa que iba a empezar el ${cuando} no entrará en vigor.`}
        impacto={[
          actual ? "Se sigue cobrando la tarifa vigente." : "Seguirá sin haber una tarifa vigente.",
          "Queda en el historial como «Anterior».",
        ]}
        verbo="Cancelar programación"
        verboCargando="Cancelando…"
        tono="destructive"
        onConfirm={async () => {
          const res = await cancelarTarifaProgramada(tarifa.id);
          if (!res.success) return { ok: false, error: res.error };
          avisarExito("Cancelamos la tarifa programada.");
          router.refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}
