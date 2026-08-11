import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Button, Card, Text } from '@/src/components/ui';
import { generarAsientos } from '@/src/utils/seatLayout';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

interface SeatSelectorProps {
  viaje_id: string;
  asientosTotales: number;
  asientosOcupados: string[];
  precioUnitario: number;
  onConfirm: (asientos: string[]) => void;
}

const SEAT_SIZE = Sizes.control.md - 4;
const AISLE_WIDTH = Spacing.xl;

// ─── Seat ────────────────────────────────────────────────────────────────────

function SeatButton({
  seat,
  ocupado,
  seleccionado,
  onToggle,
}: {
  seat: string;
  ocupado: boolean;
  seleccionado: boolean;
  onToggle: (seat: string) => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    if (ocupado) return;
    // Selecting pops; deselecting settles back without the overshoot.
    scale.value = seleccionado
      ? withSpring(1, Motion.spring.snappy)
      : withSequence(withSpring(1.14, Motion.spring.bouncy), withSpring(1, Motion.spring.snappy));
    Haptics.selectionAsync();
    onToggle(seat);
  };

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const colors = seleccionado
    ? { bg: Colors.accent, border: Colors.accent, fg: Colors.white }
    : ocupado
      ? { bg: Colors.surface, border: Colors.border, fg: Colors.mutedForeground }
      : { bg: Colors.white, border: Colors.border, fg: Colors.foreground };

  return (
    <Animated.View style={[s.seatWrapper, animStyle]}>
      <PressableScale
        onPress={handlePress}
        disabled={ocupado}
        scaleValue={0.92}
        duration={Motion.duration.instant}
        style={[s.seat, { backgroundColor: colors.bg, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado, selected: seleccionado }}
        accessibilityLabel={`Asiento ${seat}${
          ocupado ? ', ocupado' : seleccionado ? ', seleccionado' : ', disponible'
        }`}
      >
        <Text
          variant="caption"
          size="xs"
          weight={seleccionado ? 'heavy' : 'bold'}
          color={colors.fg}
          compact
          style={ocupado ? s.seatOcupado : undefined}
        >
          {seat}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

// ─── Selector ────────────────────────────────────────────────────────────────

export function SeatSelector({
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
        prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]
      );
    },
    [asientosOcupados]
  );

  // Someone else may take a seat we had picked; drop it silently.
  useEffect(() => {
    setSeleccionados((prev) => prev.filter((s) => !asientosOcupados.includes(s)));
  }, [asientosOcupados]);

  const total = seleccionados.length * precioUnitario;
  const ordenados = [...seleccionados].sort((a, b) => Number(a) - Number(b));

  return (
    <Card padding="md">
      <View style={s.legend}>
        <LegendItem color={Colors.white} bordered label="Libre" />
        <LegendItem color={Colors.accent} label="Tu asiento" />
        <LegendItem color={Colors.surface} bordered label="Ocupado" />
      </View>

      <View style={s.bus}>
        <Text variant="overline" color="muted" align="center" uppercase style={s.busFront}>
          Frente
        </Text>

        <ScrollView style={s.busScroll} showsVerticalScrollIndicator={false}>
          {filas.map((fila, rowIndex) => (
            <View key={`fila-${rowIndex}`} style={s.row}>
              {fila.map((seat, colIndex) =>
                seat === '' ? (
                  <View key={`pasillo-${rowIndex}-${colIndex}`} style={s.aisle} />
                ) : (
                  <SeatButton
                    key={seat}
                    seat={seat}
                    ocupado={asientosOcupados.includes(seat)}
                    seleccionado={seleccionados.includes(seat)}
                    onToggle={toggleSeat}
                  />
                )
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {seleccionados.length > 0 ? (
        <View style={s.summary}>
          <View style={s.summaryRow}>
            <Text variant="secondary" color="muted">
              {`Asiento${ordenados.length > 1 ? 's' : ''} `}
              <Text variant="bodyStrong" size="sm">
                {ordenados.join(', ')}
              </Text>
            </Text>
            <Text variant="secondary" color="muted">
              {`× ${precioUnitario} Bs`}
            </Text>
          </View>

          <View style={s.totalRow}>
            <Text variant="subheading" weight="heavy">
              Total
            </Text>
            <Text variant="title" size="2xl" color="accent" compact>
              {`${total.toFixed(2)} Bs`}
            </Text>
          </View>
        </View>
      ) : (
        <Text variant="secondary" color="muted" align="center" style={s.hint}>
          Toca los asientos que quieras reservar.
        </Text>
      )}

      <Button
        variant="accent"
        fullWidth
        disabled={seleccionados.length === 0}
        onPress={() => onConfirm(seleccionados)}
      >
        Continuar al pago
      </Button>
    </Card>
  );
}

function LegendItem({
  color,
  label,
  bordered,
}: {
  color: string;
  label: string;
  bordered?: boolean;
}) {
  return (
    <View style={s.legendItem}>
      <View
        style={[
          s.legendDot,
          {
            backgroundColor: color,
            borderWidth: bordered ? Sizes.hairline : 0,
            borderColor: Colors.border,
          },
        ]}
      />
      <Text variant="caption" color="muted" compact>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
  },
  legendDot: {
    width: Spacing.lg - 2,
    height: Spacing.lg - 2,
    borderRadius: Radius.xs,
  },
  bus: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  busFront: {
    marginBottom: Spacing.lg,
  },
  busScroll: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seatWrapper: {
    marginHorizontal: Spacing.xs - 1,
  },
  seat: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Sizes.hairline,
  },
  seatOcupado: {
    textDecorationLine: 'line-through',
  },
  aisle: {
    width: AISLE_WIDTH,
    height: SEAT_SIZE,
  },
  summary: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hint: {
    marginBottom: Spacing.xl,
  },
});
