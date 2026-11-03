"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { AvisoError } from "@/components/aviso-error";
import { formatDuracion } from "@/lib/fechas";
import { costoEncomiendaUsd, type Tarifa, type RouteOption } from "@/lib/types/admin-tarifas";
import { formatCiudad } from "@/lib/ciudades";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import type { TasaBCV } from "@/lib/types/pagos";
import { Monto } from "@/components/monto";

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
      <CardHeader>
        <CardTitle>Simulador de costos</CardTitle>
        <CardDescription>Cuánto cuesta un envío con la tarifa vigente.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!tarifa ? (
          <p className="text-sm text-muted-foreground">Publica una tarifa con «Nueva tarifa» para usar el simulador.</p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="sim-ruta">Ruta</FieldLabel>
              <Select
                value={selectedRutaId}
                onValueChange={(val) => setSelectedRutaId(val ?? "")}
                // Etiqueta de la ruta elegida: sin `items`, el Select mostraría su id.
                items={Object.fromEntries(
                  rutas.map((r) => [r.id, `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)} (${r.cooperativa_nombre})`])
                )}
              >
                <SelectTrigger id="sim-ruta" className="w-full">
                  <SelectValue placeholder="Elige una ruta activa" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {rutas.map((ruta) => (
                    <SelectItem key={ruta.id} value={ruta.id}>
                      {formatCiudad(ruta.ciudad_origen)} → {formatCiudad(ruta.ciudad_destino)}
                      <span className="text-muted-foreground">({ruta.cooperativa_nombre})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="sim-peso">Peso (kg)</FieldLabel>
                <Input
                  id="sim-peso"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max={maxPeso}
                  value={peso === 0 ? "" : Number(peso.toFixed(1))}
                  onChange={(e) => handlePesoChange(parseFloat(e.target.value))}
                  className="h-8 w-24 text-right tabular-nums"
                />
              </div>
              <input
                type="range"
                min="0.5"
                max={maxPeso}
                step="0.5"
                value={peso}
                onChange={handleSliderChange}
                aria-label="Peso de la encomienda"
                aria-valuetext={`${formatNumeroVE(peso, 1)} kg`}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-accent-strong"
              />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>0,5 kg</span>
                <span>Máximo {formatNumeroVE(maxPeso, 1)} kg</span>
              </div>
            </Field>

            {calculation ? (
              calculation.exceedsLimit ? (
                <AvisoError>
                  El peso supera el máximo de la tarifa vigente ({formatNumeroVE(tarifa.peso_max_kg, 1)} kg).
                </AvisoError>
              ) : (
                <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
                  <dl className="grid grid-cols-2 gap-3 border-b border-border pb-3">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Costo base</dt>
                      <dd className="text-sm font-medium tabular-nums">{formatUsd(calculation.costo_base)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">
                        Recargo por {formatDuracion(selectedRoute?.duracion_estimada_min ?? 0)}
                      </dt>
                      <dd className="text-sm font-medium tabular-nums">{formatUsd(calculation.costo_distancia)}</dd>
                    </div>
                  </dl>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold">Costo total</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{calculation.formula}</span>
                    </div>
                    <Monto usd={calculation.costo_total} tasa={tasa} moneda="USD" size="lg" align="right" />
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Elige una ruta para ver el cálculo.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
