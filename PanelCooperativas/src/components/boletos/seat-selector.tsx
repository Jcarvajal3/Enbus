"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface SeatSelectorProps {
  viajeId: string;
  totalAsientos: number;
  onSelect: (asiento: string) => void;
  onCancel: () => void;
}

export function SeatSelector({ viajeId, totalAsientos, onSelect, onCancel }: SeatSelectorProps) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);

  const fetchOcupados = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("boletos")
        .select("asiento")
        .eq("viaje_id", viajeId)
        .in("estado", ["RESERVADO", "PAGADO", "USADO"]);

      if (error) throw error;
      
      const ocupadosList = data.map((b) => b.asiento);
      setOcupados(ocupadosList);
    } catch (error) {
      console.error("Error cargando asientos ocupados:", error);
      toast.error("Error al cargar la disponibilidad de asientos.");
    } finally {
      setLoading(false);
    }
  }, [supabase, viajeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOcupados();
  }, [fetchOcupados]);

  // Generar asientos basados en totalAsientos
  const totalFilas = Math.ceil(totalAsientos / 4);
  const asientosData = [];
  
  for (let fila = 1; fila <= totalFilas; fila++) {
    const filaAsientos = [];
    for (const col of ["A", "B", "C", "D"]) {
      const id = `${fila}${col}`;
      const num = (fila - 1) * 4 + "ABCD".indexOf(col) + 1;
      
      if (num <= totalAsientos) {
        filaAsientos.push({
          id,
          ocupado: ocupados.includes(id)
        });
      } else {
        filaAsientos.push(null); // Placeholder para mantener la cuadrícula
      }
    }
    asientosData.push(filaAsientos);
  }

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Spinner size="lg" />
        <p>Verificando disponibilidad de asientos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full max-w-sm p-6 bg-muted/20 border rounded-2xl">
        <div className="flex justify-center mb-8 border-b-2 border-dashed pb-4 text-muted-foreground font-medium uppercase tracking-widest text-xs">
          Frente del Bus
        </div>
        
        <div className="space-y-3">
          {asientosData.map((fila, filaIdx) => (
            <div key={`fila-${filaIdx}`} className="flex justify-between items-center w-full">
              {/* Lado izquierdo (Ventana y Pasillo) */}
              <div className="flex gap-2">
                {fila.slice(0, 2).map((asiento, idx) => {
                  if (!asiento) return <div key={`empty-${idx}`} className="w-12 h-12" />;
                  
                  const isSelected = selectedSeat === asiento.id;
                  
                  return (
                    <button
                      key={asiento.id}
                      disabled={asiento.ocupado}
                      onClick={() => setSelectedSeat(asiento.id)}
                      className={cn(
                        "relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-200",
                        asiento.ocupado && "bg-muted text-muted-foreground/50 cursor-not-allowed border-none",
                        !asiento.ocupado && !isSelected && "bg-background border-2 border-border hover:border-primary/50 text-foreground shadow-sm",
                        isSelected && "bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                    >
                      {isSelected ? <Check className="w-5 h-5" /> : asiento.id}
                    </button>
                  );
                })}
              </div>

              {/* Pasillo central */}
              <div className="w-6 sm:w-8" />

              {/* Lado derecho (Pasillo y Ventana) */}
              <div className="flex gap-2">
                {fila.slice(2, 4).map((asiento, idx) => {
                  if (!asiento) return <div key={`empty-${idx}`} className="w-12 h-12" />;
                  
                  const isSelected = selectedSeat === asiento.id;
                  
                  return (
                    <button
                      key={asiento.id}
                      disabled={asiento.ocupado}
                      onClick={() => setSelectedSeat(asiento.id)}
                      className={cn(
                        "relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-200",
                        asiento.ocupado && "bg-muted text-muted-foreground/50 cursor-not-allowed border-none",
                        !asiento.ocupado && !isSelected && "bg-background border-2 border-border hover:border-primary/50 text-foreground shadow-sm",
                        isSelected && "bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                    >
                      {isSelected ? <Check className="w-5 h-5" /> : asiento.id}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground mt-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md border-2 border-border bg-background" />
          <span>Libre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-muted" />
          <span>Ocupado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-primary" />
          <span className="text-foreground font-medium">Seleccionado</span>
        </div>
      </div>

      <div className="flex w-full justify-between mt-8 pt-4 border-t">
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
        <Button 
          disabled={!selectedSeat} 
          onClick={() => selectedSeat && onSelect(selectedSeat)}
        >
          Confirmar Asiento
        </Button>
      </div>
    </div>
  );
}
