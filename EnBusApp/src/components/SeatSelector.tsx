import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from '@/tw';
import * as Haptics from 'expo-haptics';
import { generarAsientos } from '@/src/utils/seatLayout';

interface SeatSelectorProps {
  viaje_id: string;
  asientosTotales: number;
  asientosOcupados: string[];
  precioUnitario: number;
  onConfirm: (asientos: string[]) => void;
}


export function SeatSelector({
  viaje_id,
  asientosTotales,
  asientosOcupados,
  precioUnitario,
  onConfirm,
}: SeatSelectorProps) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  // REF-02: generarAsientos is now imported from src/utils/seatLayout.ts
  // useMemo so the grid is only recomputed when asientosTotales changes.
  const filas = useMemo(() => generarAsientos(asientosTotales), [asientosTotales]);

  // REF-04: useCallback for stable reference
  const toggleSeat = useCallback((seat: string) => {
    if (asientosOcupados.includes(seat)) return;
    Haptics.selectionAsync();
    setSeleccionados((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]
    );
  }, [asientosOcupados]);

  // Si un asiento que el usuario ya eligió queda bloqueado por tiempo real,
  // lo removemos automáticamente de su selección para evitar doble-booking.
  useEffect(() => {
    setSeleccionados((prev) =>
      prev.filter((s) => !asientosOcupados.includes(s))
    );
  }, [asientosOcupados]);

  const getEstadoColor = (seat: string) => {
    if (seat === '') return 'bg-transparent';
    if (asientosOcupados.includes(seat)) return 'bg-muted opacity-50';
    if (seleccionados.includes(seat)) return 'bg-primary';
    return 'bg-secondary border border-border';
  };

  const getTextColor = (seat: string) => {
    if (seleccionados.includes(seat)) return 'text-primary-foreground font-black';
    if (asientosOcupados.includes(seat)) return 'text-muted-foreground line-through';
    return 'text-foreground font-bold';
  };

  const total = seleccionados.length * precioUnitario;

  return (
    <View className="bg-card rounded-[14px] p-6 border border-border">
      {/* Leyenda */}
      <View className="flex-row justify-center gap-6 mb-6">
        <View className="flex-row items-center">
          <View className="size-4 bg-secondary border border-border rounded mr-2" />
          <Text className="text-xs text-muted-foreground font-medium">Libre</Text>
        </View>
        <View className="flex-row items-center">
          <View className="size-4 bg-primary rounded mr-2" />
          <Text className="text-xs text-muted-foreground font-medium">Tu asiento</Text>
        </View>
        <View className="flex-row items-center">
          <View className="size-4 bg-muted rounded mr-2 opacity-50" />
          <Text className="text-xs text-muted-foreground font-medium">Ocupado</Text>
        </View>
      </View>

      {/* Bus Layout */}
      <View className="bg-secondary/30 rounded-2xl p-4 mb-6">
        {/* Frente del bus */}
        <View className="items-center mb-4">
          <View className="w-20 h-6 bg-muted/50 rounded-t-full items-center justify-center">
            <Text className="text-[10px] text-muted-foreground font-bold uppercase">Frente</Text>
          </View>
        </View>

        {/* Filas de asientos */}
        <ScrollView className="max-h-80">
          {filas.map((fila, i) => (
            <View key={i} className="flex-row justify-center items-center mb-2">
              {fila.map((seat, j) => {
                if (seat === '') {
                  // Pasillo
                  return <View key={`pasillo-${i}-${j}`} className="w-6 h-10" />;
                }
                const esOcupado = asientosOcupados.includes(seat);
                return (
                  <Pressable
                    key={seat}
                    onPress={() => toggleSeat(seat)}
                    disabled={esOcupado}
                    className={`size-10 rounded-lg items-center justify-center mx-1 ${getEstadoColor(seat)}`}
                  >
                    <Text className={`text-xs ${getTextColor(seat)}`}>{seat}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Resumen de selección */}
      <View className="border-t border-border/50 pt-4">
        {seleccionados.length > 0 ? (
          <View className="mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-sm text-muted-foreground font-medium">
                Asientos: <Text className="text-foreground font-bold">{[...seleccionados].sort((a, b) => Number(a) - Number(b)).join(', ')}</Text>
              </Text>
              <Text className="text-sm text-muted-foreground font-medium">
                × {precioUnitario} Bs c/u
              </Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-lg font-black text-foreground">Total</Text>
              <Text className="text-2xl font-black text-primary">{total.toFixed(2)} Bs</Text>
            </View>
          </View>
        ) : (
          <Text className="text-center text-sm text-muted-foreground mb-4">
            Selecciona al menos un asiento para continuar
          </Text>
        )}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onConfirm(seleccionados);
          }}
          disabled={seleccionados.length === 0}
          className={`h-14 rounded-2xl items-center justify-center ${seleccionados.length > 0 ? 'bg-primary' : 'bg-primary/40'}`}
        >
          <Text className={`font-bold text-lg ${seleccionados.length > 0 ? 'text-primary-foreground' : 'text-primary-foreground/50'}`}>
            Continuar al Pago
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
