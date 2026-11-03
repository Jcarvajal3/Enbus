"use client";

// ─── Selector de asientos (taquilla) ────────────────────────────────────────
// Asientos numerados "1".."N" en filas 2 + pasillo + 2: el mismo formato y la
// misma distribución que la app (EnBusApp/src/utils/seatLayout.ts). Permite
// elegir varios asientos para vender una compra completa.

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Check, ArrowClockwise } from "@phosphor-icons/react";
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
      console.error("Error cargando asientos ocupados:", error);
      setErrorCarga(humanizeError(error, "cargar los asientos"));
    } finally {
      setLoading(false);
    }
  }, [supabase, viajeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOcupados();
  }, [fetchOcupados]);

  const filas = useMemo(() => {
    const resultado: (string | null)[][] = [];
    for (let numero = 1; numero <= totalAsientos; numero += 4) {
      resultado.push([0, 1, 2, 3].map((i) => (numero + i <= totalAsientos ? String(numero + i) : null)));
    }
    return resultado;
  }, [totalAsientos]);

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

  const confirmar = () => {
    if (seleccion.length > 0) onConfirm(seleccion);
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Spinner size="lg" />
        <p>Revisando qué asientos están libres…</p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="py-8 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-destructive-text">{errorCarga}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Volver</Button>
          <Button variant="outline" onClick={() => void fetchOcupados()}>
            <ArrowClockwise className="w-4 h-4 mr-2" aria-hidden />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const boton = (asiento: string | null, idx: number) => {
    if (!asiento) return <div key={`vacio-${idx}`} className="w-12 h-12 sm:w-14 sm:h-14" />;
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
          "relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center gap-0.5 font-bold text-sm tabular-nums transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          ocupado && "bg-muted text-muted-foreground/50 cursor-not-allowed border-none line-through",
          !ocupado && !elegido && "bg-background border-2 border-border-strong hover:border-primary/50 text-foreground shadow-sm",
          !ocupado && !elegido && bloqueado && "opacity-50 cursor-not-allowed",
          elegido && "bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
      >
        {elegido && <Check weight="bold" className="w-3.5 h-3.5" aria-hidden />}
        {asiento}
      </button>
    );
  };

  return (
    <div className="space-y-5 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      <p className="text-sm text-muted-foreground text-center">
        Toca los asientos que vas a vender (hasta {maxSeleccion}). Quedan {libres} libres de {totalAsientos}.
      </p>

      <div className="w-full max-w-sm p-6 bg-muted/20 border rounded-2xl">
        <div className="flex justify-center mb-6 border-b-2 border-dashed pb-4 text-muted-foreground font-medium uppercase tracking-widest text-xs">
          Frente del bus
        </div>

        <div className="space-y-3" role="group" aria-label="Asientos del bus">
          {filas.map((fila, filaIdx) => (
            <div key={`fila-${filaIdx}`} className="flex justify-between items-center w-full">
              <div className="flex gap-2">{fila.slice(0, 2).map((a, i) => boton(a, filaIdx * 4 + i))}</div>
              <div className="w-6 sm:w-8" aria-hidden />
              <div className="flex gap-2">{fila.slice(2, 4).map((a, i) => boton(a, filaIdx * 4 + 2 + i))}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md border-2 border-border-strong bg-background" aria-hidden />
          <span>Libre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-muted" aria-hidden />
          <span>Ocupado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-primary" aria-hidden />
          <span className="text-foreground font-medium">Elegido</span>
        </div>
      </div>

      {lleno && (
        <p className="text-sm text-warning-text" role="status">
          Llegaste al máximo de {maxSeleccion} asientos por venta.
        </p>
      )}

      <div className="flex w-full justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
        <Button disabled={seleccion.length === 0} onClick={confirmar}>
          {seleccion.length === 0
            ? "Elige al menos un asiento"
            : seleccion.length === 1
              ? `Continuar con el asiento ${seleccion[0]}`
              : `Continuar con los asientos ${listaAsientos(seleccion)}`}
        </Button>
      </div>
    </div>
  );
}
