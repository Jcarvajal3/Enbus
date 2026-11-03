"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tarifa, RouteOption } from "@/lib/types/admin-tarifas";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import type { TasaBCV } from "@/lib/types/pagos";
import { Monto } from "@/components/monto";
import { Calculator, ArrowRight, Info, Warning } from "@phosphor-icons/react";

interface SimuladorProps {
  tarifa: Tarifa | null;
  rutas: RouteOption[];
  /** Tasa BCV vigente para mostrar el equivalente en Bs (null: solo USD). */
  tasa?: TasaBCV | null;
}

export function Simulador({ tarifa, rutas, tasa = null }: SimuladorProps) {
  const [selectedRutaId, setSelectedRutaId] = useState<string>("");
  const [peso, setPeso] = useState<number>(5); // default 5kg

  // Get selected route details
  const selectedRoute = useMemo(() => {
    return rutas.find((r) => r.id === selectedRutaId) || null;
  }, [rutas, selectedRutaId]);

  // Calculate limits and default values
  const maxPeso = tarifa ? tarifa.peso_max_kg : 25;

  // Real-time calculation on the client for smooth UX
  const calculation = useMemo(() => {
    if (!tarifa || !selectedRoute) return null;

    // Check weight limit
    const exceedsLimit = peso > tarifa.peso_max_kg;

    const tarifa_por_kg = tarifa.tarifa_por_kg;
    const factor_distancia_por_min = tarifa.factor_distancia_por_min;
    const duracion_estimada_min = selectedRoute.duracion_estimada_min;

    const costo_base = peso * tarifa_por_kg;
    const costo_distancia = costo_base * (factor_distancia_por_min * duracion_estimada_min);
    const costo_total = costo_base + costo_distancia;

    const formula = `${formatNumeroVE(peso)} kg × USD ${formatNumeroVE(tarifa_por_kg)} × (1 + ${formatNumeroVE(factor_distancia_por_min, 4)} × ${duracion_estimada_min} min)`;

    return {
      costo_base,
      costo_distancia,
      costo_total,
      formula,
      exceedsLimit
    };
  }, [tarifa, selectedRoute, peso]);

  const handlePesoChange = (val: number) => {
    if (isNaN(val)) return;
    // Keep it non-negative
    const safeVal = Math.max(0, val);
    setPeso(safeVal);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      setPeso(val);
    }
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-lg border-primary/15 bg-gradient-to-br from-card to-secondary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-primary/15 text-primary-text">
            <Calculator className="size-4" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold tracking-tight">Simulador de Costos</CardTitle>
            <CardDescription className="text-xs">Prueba de tarifas con pesos y rutas en tiempo real</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!tarifa ? (
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-600/30 text-amber-950 text-xs dark:bg-amber-400/10 dark:text-amber-100">
            <Info className="size-4 shrink-0 text-warning-text" aria-hidden />
            <div>
              Crea una tarifa con «Nueva tarifa» para usar el simulador.
            </div>
          </div>
        ) : (
          <>
            {/* Route Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-ruta" className="text-xs font-semibold text-muted-foreground">Ruta de envío</Label>
              <Select
                value={selectedRutaId}
                onValueChange={(val) => setSelectedRutaId(val ?? "")}
                // Etiqueta de la ruta elegida: sin `items`, el Select mostraría su id.
                items={Object.fromEntries(
                  rutas.map((r) => [r.id, `${r.ciudad_origen} → ${r.ciudad_destino} (${r.cooperativa_nombre})`])
                )}
              >
                <SelectTrigger id="sim-ruta" className="bg-background border-input text-foreground text-xs h-9">
                  <SelectValue placeholder="Elige una ruta activa" />
                </SelectTrigger>
                <SelectContent className="bg-popover border text-popover-foreground max-h-[220px]">
                  {rutas.map((ruta) => (
                    <SelectItem key={ruta.id} value={ruta.id} className="text-xs">
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="font-semibold">{ruta.ciudad_origen}</span>
                        <ArrowRight className="size-2.5 text-muted-foreground" />
                        <span className="font-semibold">{ruta.ciudad_destino}</span>
                        <span className="text-xs text-muted-foreground">({ruta.cooperativa_nombre})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weight Inputs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sim-peso" className="text-xs font-semibold text-muted-foreground">Peso de la Encomienda</Label>
                <div className="flex items-center gap-1.5">
                  <Input 
                    id="sim-peso"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={peso === 0 ? "" : Number(peso.toFixed(1))}
                    onChange={(e) => handlePesoChange(parseFloat(e.target.value))}
                    className="w-20 text-right bg-background border-input text-foreground text-xs h-7 px-2 font-bold focus-visible:ring-orange-500"
                  />
                  <span className="text-xs text-muted-foreground font-semibold">kg</span>
                </div>
              </div>

              <div className="space-y-1">
                <input 
                  type="range"
                  min="0.5"
                  max={maxPeso}
                  step="0.5"
                  value={peso}
                  onChange={handleSliderChange}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-muted accent-orange-600"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                  <span>0.5 kg</span>
                  <span>Máx: {maxPeso} kg</span>
                </div>
              </div>
            </div>

            {/* Calculation Breakdown Area */}
            {calculation ? (
              <div className="rounded-xl border bg-muted/40 p-4 space-y-4">
                {calculation.exceedsLimit ? (
                  <div className="flex gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive-text text-xs">
                    <Warning className="size-4 shrink-0" />
                    <div>
                      El peso supera el límite máximo de {tarifa.peso_max_kg} kg configurado para esta tarifa.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs border-b border-border/40 pb-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Costo base</span>
                        <span className="font-semibold text-foreground">{formatUsd(calculation.costo_base)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Recargo por distancia ({selectedRoute?.duracion_estimada_min} min)</span>
                        <span className="font-semibold text-foreground">{formatUsd(calculation.costo_distancia)}</span>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-primary-text uppercase font-bold tracking-wider">Costo total simulado</span>
                        <span className="text-xs text-muted-foreground font-mono mt-0.5 font-medium">{calculation.formula}</span>
                      </div>
                      <Monto
                        usd={calculation.costo_total}
                        tasa={tasa}
                        moneda="USD"
                        size="lg"
                        align="right"
                        className="text-primary-text font-black"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Precio de referencia en USD. El cliente paga en bolívares a la tasa BCV del día.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground text-center p-3">
                Elige una ruta para ver el cálculo del envío.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
