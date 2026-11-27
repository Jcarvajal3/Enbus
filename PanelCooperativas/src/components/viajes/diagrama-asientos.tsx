"use client";

// ─── Diagrama de ocupación del bus ──────────────────────────────────────────
// Solo lectura: muestra qué asientos están libres, ocupados (reservado o pagado)
// y embarcados. Se usa en la hoja del viaje (`compacto`) y en la pantalla
// completa para la terminal (`pantalla`), donde se actualiza solo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { asientoNumerico } from "@/components/boletos/seat-selector";
import { BusAsientos } from "@/components/boletos/bus-asientos";
import { humanizeError } from "@/lib/errores";
import { cn } from "@/lib/utils";

type Estado = "OCUPADO" | "EMBARCADO";

const REFRESCO_MS = 15_000;

export function DiagramaAsientos({
  viajeId,
  totalAsientos,
  modo = "compacto",
}: {
  viajeId: string;
  totalAsientos: number;
  modo?: "compacto" | "pantalla";
}) {
  const supabase = useMemo(() => createClient(), []);
  const [estados, setEstados] = useState<Map<string, Estado>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const pantalla = modo === "pantalla";

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const { data, error: e } = await supabase
          .from("boletos")
          .select("asiento, estado")
          .eq("viaje_id", viajeId)
          .in("estado", ["RESERVADO", "PAGADO", "USADO"]);
        if (e) throw e;
        const mapa = new Map<string, Estado>();
        for (const b of (data ?? []) as { asiento: string; estado: string }[]) {
          mapa.set(asientoNumerico(b.asiento), b.estado === "USADO" ? "EMBARCADO" : "OCUPADO");
        }
        setEstados(mapa);
        setActualizado(new Date());
        setError(null);
      } catch (err) {
        // Con datos ya mostrados, un fallo de refresco no tapa el diagrama.
        if (!silencioso) setError(humanizeError(err, "cargar los asientos"));
      } finally {
        setCargando(false);
      }
    },
    [supabase, viajeId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir
    void cargar();
    const id = setInterval(() => void cargar(true), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const casilla = pantalla ? "size-16 text-2xl rounded-xl lg:size-20 lg:text-3xl" : "size-11 text-[15px] rounded-sm md:size-12";

  if (error) {
    return <ErrorState compacto titulo="No pudimos cargar los asientos" descripcion={error} onReintentar={() => cargar()} />;
  }

  const ocupados = [...estados.values()].filter((s) => s === "OCUPADO").length;
  const embarcados = estados.size - ocupados;
  const libres = Math.max(totalAsientos - estados.size, 0);

  return (
    <div className={cn("flex flex-col items-center gap-5", pantalla && "gap-8")}>
      <BusAsientos
        totalAsientos={totalAsientos}
        tamCasilla={casilla}
        grande={pantalla}
        casilla={(a) =>
          cargando ? (
            <Skeleton key={a} className={casilla} />
          ) : (
            <div
              key={a}
              role="img"
              aria-label={`Asiento ${a}, ${
                estados.get(a) === "EMBARCADO" ? "embarcado" : estados.get(a) === "OCUPADO" ? "ocupado" : "libre"
              }`}
              className={cn(
                "flex items-center justify-center border font-semibold tabular-nums",
                casilla,
                !estados.has(a) && "border-border-strong bg-background text-foreground",
                estados.get(a) === "OCUPADO" && "border-transparent bg-surface-dark text-muted-foreground",
                estados.get(a) === "EMBARCADO" && "border-transparent bg-success-light text-success-text"
              )}
            >
              {a}
            </div>
          )
        }
      />

      <div className={cn("flex flex-col items-center gap-2 text-muted-foreground", pantalla ? "text-lg" : "text-[13px]")}>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Leyenda clase="border border-border-strong bg-background" texto={`Libre (${libres})`} />
          <Leyenda clase="bg-surface-dark" texto={`Ocupado (${ocupados})`} />
          <Leyenda clase="bg-success-light" texto={`Embarcado (${embarcados})`} />
        </div>
        {pantalla && actualizado && (
          <p className="tabular-nums">
            Actualizado a las {actualizado.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-4 rounded-xs", clase)} aria-hidden />
      {texto}
    </span>
  );
}
