/**
 * SeatSelector — el mapa de asientos del paso "Elige tus asientos".
 *
 * Controlado: la pantalla guarda la selección (`seleccionados` / `onChange`) y
 * pone la acción ("Apartar asiento 6") en su `FloatingBar` (AN-03). El mapa
 * ocupa su altura y se desplaza con la pantalla, sin scroll interno (AU-22).
 *
 * Asientos (D24): disponible blanco con borde `borderStrong`; ocupado relleno
 * `surfaceDark` con el número en `mutedForeground`; elegido `accentStrong` con
 * el número en blanco. La leyenda usa la misma forma.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowClockwise, WarningCircle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Button, Text } from '@/src/components/ui';
import { generarAsientos } from '@/src/utils/seatLayout';
import { mensajeAsientosTomados, ordenarAsientos } from '@/src/hooks/useCheckoutBoletos';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

/** Mismo límite que `fn_reservar_asientos`. */
export const MAX_ASIENTOS = 10;

interface SeatSelectorProps {
  asientosTotales: number;
  /** Asientos de otros pasajeros (los apartados por esta compra no van aquí) */
  asientosOcupados: string[];
  /** Asientos elegidos (controlado) */
  seleccionados: string[];
  onChange: (asientos: string[]) => void;
  /** Se están apartando: el mapa queda bloqueado */
  confirmando?: boolean;
  /**
   * Se están leyendo los asientos ocupados (`fn_asientos_ocupados`): el mapa
   * queda bloqueado hasta tenerlos (M-17).
   */
  cargandoOcupados?: boolean;
  /** No se pudieron leer los ocupados: aviso + "Reintentar". */
  errorOcupados?: string | null;
  onReintentarOcupados?: () => void;
}

/** Asiento = área táctil mínima (44 pt). */
const SEAT_SIZE = Sizes.touchTarget;
const LEYENDA = Sizes.icon.md;

type TipoAsiento = 'libre' | 'ocupado' | 'elegido';

const COLORES: Record<TipoAsiento, { bg: string; border: string; fg: string }> = {
  libre: { bg: Colors.background, border: Colors.borderStrong, fg: Colors.foreground },
  ocupado: { bg: Colors.surfaceDark, border: Colors.surfaceDark, fg: Colors.mutedForeground },
  elegido: { bg: Colors.accentStrong, border: Colors.accentStrong, fg: Colors.accentStrongForeground },
};

// ─── Asiento ─────────────────────────────────────────────────────────────────

function SeatButton({
  seat,
  ocupado,
  seleccionado,
  bloqueado,
  onToggle,
}: {
  seat: string;
  ocupado: boolean;
  seleccionado: boolean;
  bloqueado: boolean;
  onToggle: (seat: string) => void;
}) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const handlePress = () => {
    if (ocupado || bloqueado) return;
    // Elegir rebota; soltar vuelve sin rebote. Con "reducir movimiento", solo el color.
    if (!reduceMotion) {
      scale.value = seleccionado
        ? withSpring(1, Motion.spring.snappy)
        : withSequence(withSpring(1.1, Motion.spring.bouncy), withSpring(1, Motion.spring.snappy));
    }
    Haptics.selectionAsync();
    onToggle(seat);
  };

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const colores = COLORES[seleccionado ? 'elegido' : ocupado ? 'ocupado' : 'libre'];

  return (
    <Animated.View style={animStyle}>
      <PressableScale
        onPress={handlePress}
        disabled={ocupado || bloqueado}
        dimWhenDisabled={false}
        scaleValue={Motion.press.chip}
        duration={Motion.duration.instant}
        style={[s.seat, { backgroundColor: colores.bg, borderColor: colores.border }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado || bloqueado, selected: seleccionado }}
        accessibilityLabel={`Asiento ${seat}${
          ocupado ? ', ocupado' : seleccionado ? ', elegido' : ', disponible'
        }`}
      >
        <Text variant="label" weight={seleccionado ? 'bold' : 'semibold'} color={colores.fg} compact>
          {seat}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

// ─── Mapa ────────────────────────────────────────────────────────────────────

export function SeatSelector({
  asientosTotales,
  asientosOcupados,
  seleccionados,
  onChange,
  confirmando = false,
  cargandoOcupados = false,
  errorOcupados = null,
  onReintentarOcupados,
}: SeatSelectorProps) {
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  /** "El asiento 14 acaba de ser tomado. Elige otro." (M-14) */
  const [avisoTomados, setAvisoTomados] = useState<string | null>(null);
  const filas = useMemo(() => generarAsientos(asientosTotales), [asientosTotales]);

  /** Sin la lista de ocupados no se sabe qué está libre: no se elige. */
  const mapaBloqueado = confirmando || cargandoOcupados || !!errorOcupados;

  const toggleSeat = useCallback(
    (seat: string) => {
      if (mapaBloqueado || asientosOcupados.includes(seat)) return;
      setAvisoTomados(null);
      if (seleccionados.includes(seat)) {
        setLimiteAlcanzado(false);
        onChange(seleccionados.filter((a) => a !== seat));
        return;
      }
      if (seleccionados.length >= MAX_ASIENTOS) {
        setLimiteAlcanzado(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      onChange([...seleccionados, seat]);
    },
    [asientosOcupados, mapaBloqueado, seleccionados, onChange]
  );

  // Otro pasajero tomó un asiento que habíamos elegido (lo dice el servidor o
  // la recarga de ocupados): se quita y se avisa, nunca en silencio.
  const seleccionadosRef = useRef(seleccionados);
  seleccionadosRef.current = seleccionados;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const actuales = seleccionadosRef.current;
    const tomados = actuales.filter((a) => asientosOcupados.includes(a));
    if (tomados.length === 0) return;
    onChangeRef.current(actuales.filter((a) => !asientosOcupados.includes(a)));
    setAvisoTomados(mensajeAsientosTomados(ordenarAsientos(tomados)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [asientosOcupados]);

  return (
    <View>
      {errorOcupados ? (
        <View style={[s.aviso, s.avisoError]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <WarningCircle size={Sizes.icon.lg} color={Colors.dangerText} weight="fill" />
          <View style={s.avisoCuerpo}>
            <Text variant="label">No pudimos ver qué asientos están libres</Text>
            <Text variant="caption" color="muted">
              {errorOcupados}
            </Text>
            {onReintentarOcupados ? (
              <Button
                variant="outline"
                size="sm"
                icon={ArrowClockwise}
                onPress={onReintentarOcupados}
                style={s.reintentar}
              >
                Reintentar
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}

      {avisoTomados || limiteAlcanzado ? (
        <View style={[s.aviso, s.avisoPendiente]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <WarningCircle size={Sizes.icon.lg} color={Colors.warningText} weight="fill" />
          <Text variant="label" style={s.avisoCuerpo}>
            {avisoTomados ?? `Puedes apartar hasta ${MAX_ASIENTOS} asientos por compra.`}
          </Text>
        </View>
      ) : null}

      <View style={s.leyenda}>
        <Leyenda tipo="libre" label="Libre" />
        <Leyenda tipo="elegido" label="Elegido" />
        <Leyenda tipo="ocupado" label="Ocupado" />
      </View>

      <View style={s.bus} accessibilityLabel="Mapa de asientos">
        <Text variant="caption" color="muted" align="center" style={s.frente}>
          Frente del bus
        </Text>
        {filas.map((fila, rowIndex) => (
          <View key={`fila-${rowIndex}`} style={s.fila}>
            {fila.map((seat, colIndex) =>
              seat === '' ? (
                <View key={`pasillo-${rowIndex}-${colIndex}`} style={s.pasillo} />
              ) : (
                <SeatButton
                  key={seat}
                  seat={seat}
                  ocupado={asientosOcupados.includes(seat)}
                  seleccionado={seleccionados.includes(seat)}
                  bloqueado={mapaBloqueado}
                  onToggle={toggleSeat}
                />
              )
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Leyenda({ tipo, label }: { tipo: TipoAsiento; label: string }) {
  const colores = COLORES[tipo];
  return (
    <View style={s.leyendaItem}>
      <View style={[s.leyendaMuestra, { backgroundColor: colores.bg, borderColor: colores.border }]} />
      <Text variant="caption" color="muted" compact>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  avisoError: {
    alignItems: 'flex-start',
    backgroundColor: Colors.destructiveLight,
  },
  avisoPendiente: {
    backgroundColor: Colors.warningLight,
  },
  avisoCuerpo: {
    flex: 1,
    gap: Spacing.xs,
  },
  reintentar: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  leyenda: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  leyendaMuestra: {
    width: LEYENDA,
    height: LEYENDA,
    borderRadius: Radius.xs,
    borderWidth: Sizes.borderStrong,
  },
  bus: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  frente: {
    marginBottom: Spacing.lg,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  seat: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Sizes.borderStrong,
  },
  pasillo: {
    width: Spacing.xl,
    height: SEAT_SIZE,
  },
});
