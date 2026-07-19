import { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { View, Text, ScrollView } from '@/tw';
import * as Haptics from 'expo-haptics';
import { generarAsientos } from '@/src/utils/seatLayout';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Colors, Typography, Radius, Shadows, Gradients } from '@/src/theme';

interface SeatSelectorProps {
  viaje_id: string;
  asientosTotales: number;
  asientosOcupados: string[];
  precioUnitario: number;
  onConfirm: (asientos: string[]) => void;
}

// Asiento individual con spring animation al seleccionar (P2)
function SeatButton({
  seat,
  isOcupado,
  isSeleccionado,
  onToggle,
}: {
  seat: string;
  isOcupado: boolean;
  isSeleccionado: boolean;
  onToggle: (seat: string) => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    if (isOcupado) return;
    // Spring bounce al seleccionar: 0.85 → 1.1 → 1.0
    scale.value = withSpring(isSeleccionado ? 1 : 1.12, {
      damping: 8,
      stiffness: 300,
    });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    }, 100);
    Haptics.selectionAsync();
    onToggle(seat);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  let bgColor: string = Colors.white;
  let borderColor: string = Colors.border;
  let textColor: string = Colors.foreground;
  let textWeight: '700' | '900' | '400' = '700';
  let strikethrough = false;

  if (isSeleccionado) {
    bgColor = Colors.accent;
    borderColor = Colors.accent;
    textColor = Colors.white;
    textWeight = '900';
  } else if (isOcupado) {
    bgColor = Colors.surface;
    borderColor = Colors.border;
    textColor = Colors.mutedForeground;
    strikethrough = true;
  }

  return (
    <Animated.View style={[styles.seatWrapper, animStyle]}>
      <PressableScale
        onPress={handlePress}
        disabled={isOcupado}
        scaleValue={0.92}
        duration={100}
        style={[
          styles.seat,
          { backgroundColor: bgColor, borderColor },
        ]}
      >
        <Text
          style={[
            styles.seatText,
            { color: textColor, fontWeight: textWeight },
            strikethrough && styles.strikethrough,
          ]}
        >
          {seat}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export function SeatSelector({
  viaje_id,
  asientosTotales,
  asientosOcupados,
  precioUnitario,
  onConfirm,
}: SeatSelectorProps) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const filas = useMemo(() => generarAsientos(asientosTotales), [asientosTotales]);

  const toggleSeat = useCallback(
    (seat: string) => {
      if (asientosOcupados.includes(seat)) return;
      setSeleccionados((prev) =>
        prev.includes(seat)
          ? prev.filter((s) => s !== seat)
          : [...prev, seat]
      );
    },
    [asientosOcupados]
  );

  useEffect(() => {
    setSeleccionados((prev) =>
      prev.filter((s) => !asientosOcupados.includes(s))
    );
  }, [asientosOcupados]);

  const total = seleccionados.length * precioUnitario;

  return (
    <View style={styles.container}>
      {/* Leyenda */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border }]} />
          <Text style={styles.legendText}>Libre</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.legendText}>Tu asiento</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]} />
          <Text style={styles.legendText}>Ocupado</Text>
        </View>
      </View>

      {/* Bus Layout */}
      <View style={styles.busLayout}>
        <View style={styles.busFront}>
          <Text style={styles.busFrontText}>FRENTE</Text>
        </View>
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          {filas.map((fila, i) => (
            <View key={i} style={styles.fila}>
              {fila.map((seat, j) => {
                if (seat === '') {
                  return <View key={`pasillo-${i}-${j}`} style={styles.pasillo} />;
                }
                return (
                  <SeatButton
                    key={seat}
                    seat={seat}
                    isOcupado={asientosOcupados.includes(seat)}
                    isSeleccionado={seleccionados.includes(seat)}
                    onToggle={toggleSeat}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Resumen */}
      <View style={styles.summary}>
        {seleccionados.length > 0 ? (
          <View style={styles.summaryInner}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Asientos:{' '}
                <Text style={styles.summaryValue}>
                  {[...seleccionados].sort((a, b) => Number(a) - Number(b)).join(', ')}
                </Text>
              </Text>
              <Text style={styles.perUnit}>× {precioUnitario} Bs</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{total.toFixed(2)} Bs</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>Selecciona al menos un asiento para continuar</Text>
        )}

        <PressableScale
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onConfirm(seleccionados);
          }}
          disabled={seleccionados.length === 0}
          haptic
          hapticType="medium"
          style={[
            styles.confirmBtn,
            seleccionados.length === 0 && styles.confirmBtnDisabled,
          ]}
        >
          <Text
            style={[
              styles.confirmBtnText,
              seleccionados.length === 0 && styles.confirmBtnTextDisabled,
            ]}
          >
            Continuar al Pago
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl, // 24
    padding: 20,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.medium,
    fontFamily: Typography.family,
  },
  busLayout: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md, // 16
    padding: 16,
    marginBottom: 20,
  },
  busFront: {
    alignItems: 'center',
    marginBottom: 16,
  },
  busFrontText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    letterSpacing: 2,
    fontFamily: Typography.family,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  seatWrapper: {
    marginHorizontal: 3,
  },
  seat: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm, // 10
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  seatText: {
    fontSize: 11,
    fontFamily: Typography.family,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  pasillo: {
    width: 20,
    height: 40,
  },
  summary: {
    borderTopWidth: 0,
    paddingTop: 16,
  },
  summaryInner: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.mutedForeground,
    fontFamily: Typography.family,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  perUnit: {
    fontSize: 13,
    color: Colors.mutedForeground,
    fontFamily: Typography.family,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: Typography.weights.heavy,
    color: Colors.accent,
    fontFamily: Typography.family,
  },
  hint: {
    fontSize: 13,
    color: Colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: Typography.family,
  },
  confirmBtn: {
    height: 54,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(74, 127, 248, 0.35)',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: Typography.weights.bold,
    color: Colors.white,
    fontFamily: Typography.family,
  },
  confirmBtnTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: Typography.family,
  },
});
