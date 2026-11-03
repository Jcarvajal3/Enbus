"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { costoEncomiendaUsd, type Tarifa, type RouteOption } from "@/lib/types/admin-tarifas";
import { formatCiudad } from "@/lib/ciudades";
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

    const costo_base = Math.round(peso * tarifa_por_kg * 100) / 100;
    // Mismo redondeo que _costo_encomienda: el total es lo que cobra la taquilla.
    const costo_total = costoEncomiendaUsd(peso, tarifa, duracion_estimada_min);
    const costo_distancia = Math.max(0, Math.round((costo_total - costo_base) * 100) / 100);

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-primary/15 text-primary-text">
            <Calculator className="size-4" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold tracking-tight">Simulador de costos</CardTitle>
            <CardDescription className="text-xs">Calcula cuánto cuesta un envío con la tarifa vigente.</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!tarifa ? (
          <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
            <Info className="size-4 shrink-0" aria-hidden />
            <div>
              Publica una tarifa con «Nueva tarifa» para usar el simulador.
            </div>
          </div>
        ) : (
          <>
            {/* Route Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-ruta" className="text-sm font-medium">Ruta de envío</Label>
              <Select
                value={selectedRutaId}
                onValueChange={(val) => setSelectedRutaId(val ?? "")}
                // Etiqueta de la ruta elegida: sin `items`, el Select mostraría su id.
                items={Object.fromEntries(
                  rutas.map((r) => [r.id, `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)} (${r.cooperativa_nombre})`])
                )}
              >
                <SelectTrigger id="sim-ruta" className="h-9 w-full bg-background text-sm">
                  <SelectValue placeholder="Elige una ruta activa" />
                </SelectTrigger>
                <SelectContent className="bg-popover border text-popover-foreground max-h-[220px]">
                  {rutas.map((ruta) => (
                    <SelectItem key={ruta.id} value={ruta.id} className="text-sm">
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="font-semibold">{formatCiudad(ruta.ciudad_origen)}</span>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <span className="font-semibold">{formatCiudad(ruta.ciudad_destino)}</span>
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
                <Label htmlFor="sim-peso" className="text-sm font-medium">Peso de la encomienda (kg)</Label>
                <div className="flex items-center gap-1.5">
                  <Input 
                    id="sim-peso"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max={maxPeso}
                    value={peso === 0 ? "" : Number(peso.toFixed(1))}
                    onChange={(e) => handlePesoChange(parseFloat(e.target.value))}
                    className="h-8 w-20 bg-background px-2 text-right text-sm font-semibold tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden>kg</span>
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
                  aria-label="Peso de la encomienda"
                  aria-valuetext={`${formatNumeroVE(peso, 1)} kg`}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                  <span>0,5 kg</span>
                  <span>Máximo {formatNumeroVE(maxPeso, 1)} kg</span>
                </div>
              </div>
            </div>

            {/* Calculation Breakdown Area */}
            {calculation ? (
              <div className="rounded-xl border bg-muted/40 p-4 space-y-4">
                {calculation.exceedsLimit ? (
                  <div className="flex gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive-text text-xs">
                    <Warning className="size-4 shrink-0" aria-hidden />
                    <div>
                      El peso supera el máximo de la tarifa vigente ({formatNumeroVE(tarifa.peso_max_kg, 1)} kg).
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs border-b border-border/40 pb-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-muted-foreground">Costo base</span>
                        <span className="font-semibold text-foreground">{formatUsd(calculation.costo_base)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-muted-foreground">Recargo por distancia ({selectedRoute?.duracion_estimada_min} min)</span>
                        <span className="font-semibold text-foreground">{formatUsd(calculation.costo_distancia)}</span>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-primary/15 p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">Costo total</span>
                        <span className="text-xs text-muted-foreground font-mono mt-0.5 font-medium">{calculation.formula}</span>
                      </div>
                      <Monto
                        usd={calculation.costo_total}
                        tasa={tasa}
                        moneda="USD"
                        size="lg"
                        align="right"
                        className="text-foreground"
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
