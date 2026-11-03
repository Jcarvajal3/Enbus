"use client";

// ─── Selector de asientos (taquilla) ────────────────────────────────────────
// Asientos numerados "1".."N" en filas 2 + pasillo + 2: el mismo formato y la
// misma distribución que la app (EnBusApp/src/utils/seatLayout.ts). Permite
// elegir varios asientos para vender una compra completa.
// Colores D24: libre blanco con borde `border-strong`; ocupado relleno
// `surface-dark` con el número en `muted-foreground`; elegido `accent-strong`.

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { cn } from "@/lib/utils";
import { humanizeError } from "@/lib/errores";

interface SeatSelectorProps {
  viajeId: string;
  totalAsientos: number;
  /** Asientos ya elegidos (al volver desde el paso siguiente). */
  seleccionInicial?: string[];
  /** Máximo de asientos por venta (el servidor acepta hasta 10). */
  maxSeleccion?: number;
  onConfirm: (asientos: string[]) => void;
  onCancel: () => void;
}

/** Asientos guardados con el formato antiguo del panel ("3B") → número ("10"). */
function asientoNumerico(asiento: string): string {
  const m = /^(\d+)([A-D])$/i.exec(asiento.trim());
  if (!m) return asiento.trim();
  return String((Number(m[1]) - 1) * 4 + "ABCD".indexOf(m[2].toUpperCase()) + 1);
}

/** "14" / "14 y 15" / "3, 14 y 15" */
export function listaAsientos(asientos: string[]): string {
  const orden = [...asientos].sort((a, b) => Number(a) - Number(b));
  if (orden.length <= 1) return orden.join("");
  return `${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}`;
}

const CASILLA = "size-12 sm:size-14";

/** Filas de 4 (2 + pasillo + 2), con huecos al final. */
function filasDe(totalAsientos: number): (string | null)[][] {
  const resultado: (string | null)[][] = [];
  for (let numero = 1; numero <= totalAsientos; numero += 4) {
    resultado.push([0, 1, 2, 3].map((i) => (numero + i <= totalAsientos ? String(numero + i) : null)));
  }
  return resultado;
}

function Bus({ filas, casilla }: { filas: (string | null)[][]; casilla: (asiento: string | null, idx: number) => React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-md border border-border bg-card p-6">
      <p className="mb-6 border-b border-dashed border-border-strong pb-4 text-center text-xs font-medium text-muted-foreground">
        Frente
      </p>
      <div className="flex flex-col gap-3" role="group" aria-label="Asientos del bus">
        {filas.map((fila, filaIdx) => (
          <div key={`fila-${filaIdx}`} className="flex w-full items-center justify-between">
            <div className="flex gap-2">{fila.slice(0, 2).map((a, i) => casilla(a, filaIdx * 4 + i))}</div>
            <div className="w-6 sm:w-8" aria-hidden />
            <div className="flex gap-2">{fila.slice(2, 4).map((a, i) => casilla(a, filaIdx * 4 + 2 + i))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SeatSelector({
  viajeId,
  totalAsientos,
  seleccionInicial = [],
  maxSeleccion = 10,
  onConfirm,
  onCancel,
}: SeatSelectorProps) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>(seleccionInicial);

  const fetchOcupados = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
    try {
      const { data, error } = await supabase
        .from("boletos")
        .select("asiento")
        .eq("viaje_id", viajeId)
        .in("estado", ["RESERVADO", "PAGADO", "USADO"]);

      if (error) throw error;
      const lista = ((data as { asiento: string }[] | null) ?? []).map((b) => asientoNumerico(b.asiento));
      const nuevos = new Set(lista);
      setOcupados(nuevos);
      // Un asiento elegido que acaba de ocuparse deja de estar seleccionado.
      setSeleccion((prev) => prev.filter((a) => !nuevos.has(a)));
    } catch (error) {
      setErrorCarga(humanizeError(error, "cargar los asientos"));
    } finally {
      setLoading(false);
    }
  }, [supabase, viajeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOcupados();
  }, [fetchOcupados]);

  const filas = useMemo(() => filasDe(totalAsientos), [totalAsientos]);

  const libres = totalAsientos - ocupados.size;
  const lleno = seleccion.length >= maxSeleccion;

  const alternar = (asiento: string) => {
    setSeleccion((prev) =>
      prev.includes(asiento)
        ? prev.filter((a) => a !== asiento)
        : prev.length >= maxSeleccion
          ? prev
          : [...prev, asiento].sort((a, b) => Number(a) - Number(b))
    );
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
      <Button variant="outline" onClick={onCancel}>
        Atrás
      </Button>
      {!loading && !errorCarga && (
        <Button disabled={seleccion.length === 0} onClick={() => seleccion.length > 0 && onConfirm(seleccion)}>
          Continuar
        </Button>
      )}
    </div>
  );

  if (errorCarga) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorState compacto titulo="No pudimos cargar los asientos" descripcion={errorCarga} onReintentar={fetchOcupados} />
        {pie}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-5" role="status" aria-label="Cargando los asientos">
        <Skeleton className="h-4 w-48" />
        <Bus
          filas={filas}
          casilla={(a, idx) =>
            a ? <Skeleton key={a} className={cn(CASILLA, "rounded-sm")} /> : <div key={`vacio-${idx}`} className={CASILLA} />
          }
        />
        {pie}
      </div>
    );
  }

  const casilla = (asiento: string | null, idx: number) => {
    if (!asiento) return <div key={`vacio-${idx}`} className={CASILLA} />;
    const ocupado = ocupados.has(asiento);
    const elegido = seleccion.includes(asiento);
    const bloqueado = ocupado || (lleno && !elegido);
    return (
      <button
        key={asiento}
        type="button"
        disabled={bloqueado}
        aria-pressed={elegido}
        aria-label={`Asiento ${asiento}, ${ocupado ? "ocupado" : elegido ? "elegido" : bloqueado ? "libre (llegaste al máximo)" : "libre"}`}
        onClick={() => alternar(asiento)}
        className={cn(
          CASILLA,
          "flex items-center justify-center rounded-sm border text-sm font-semibold tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          ocupado && "cursor-not-allowed border-transparent bg-surface-dark text-muted-foreground",
          !ocupado && !elegido && "border-border-strong bg-background text-foreground hover:bg-muted",
          !ocupado && !elegido && bloqueado && "cursor-not-allowed opacity-50 hover:bg-background",
          elegido && "border-accent-strong bg-accent-strong text-accent-strong-foreground"
        )}
      >
        {asiento}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <Bus filas={filas} casilla={casilla} />

      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2">
            <span className="size-4 rounded-xs border border-border-strong bg-background" aria-hidden />
            Libre
          </span>
          <span className="flex items-center gap-2">
            <span className="size-4 rounded-xs bg-surface-dark" aria-hidden />
            Ocupado
          </span>
          <span className="flex items-center gap-2">
            <span className="size-4 rounded-xs bg-accent-strong" aria-hidden />
            Elegido
          </span>
        </div>
        <p className="tabular-nums" aria-live="polite">
          {libres} libres de {totalAsientos} · máx. {maxSeleccion}
          {seleccion.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">
                {seleccion.length === 1 ? "Asiento" : "Asientos"} {listaAsientos(seleccion)}
              </span>
            </>
          )}
        </p>
      </div>

      {pie}
    </div>
  );
}
