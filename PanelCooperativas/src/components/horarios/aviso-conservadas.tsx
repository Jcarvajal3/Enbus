"use client";

import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDiaHoraVE } from "@/lib/fechas";
import type { SalidaConservada } from "@/lib/types/horarios";

// ─── Salidas que ya tienen pasajeros y el sistema no tocó ────────────────────
// Se muestra en Rutas (salidas) y en Configuración → Días no laborables cuando un cambio
// dejaría fuera de horario salidas con boletos o encomiendas. Persiste hasta que se
// cierra: el administrador las cancela a mano en Viajes (reembolsa y avisa).

export function AvisoConservadas({
  conservadas,
  onCerrar,
}: {
  conservadas: SalidaConservada[];
  onCerrar(): void;
}) {
  if (conservadas.length === 0) return null;
  const una = conservadas.length === 1;
  return (
    <Alert variant="warning">
      <WarningCircle weight="fill" aria-hidden />
      <AlertTitle>
        {una ? "1 salida ya tiene pasajeros y no se cambió" : `${conservadas.length} salidas ya tienen pasajeros y no se cambiaron`}
      </AlertTitle>
      <AlertDescription>
        <p>Estas salidas ya tienen pasajeros y no se cambiaron. Cancélalas en Viajes si no van a salir:</p>
        <ul className="mb-3 list-disc pl-5">
          {conservadas.map((s) => (
            <li key={s.viaje_id}>
              {formatDiaHoraVE(s.fecha_hora_salida)} · {s.ocupados === 1 ? "1 puesto ocupado" : `${s.ocupados} puestos ocupados`}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/cooperativas/viajes" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Ir a Viajes
          </Link>
          <Button type="button" size="sm" variant="ghost" onClick={onCerrar}>
            Entendido
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
