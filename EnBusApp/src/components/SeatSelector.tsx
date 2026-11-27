/**
 * SeatSelector — el mapa de asientos del paso "Elige tus asientos".
 *
 * Controlado: la pantalla guarda la selección (`seleccionados` / `onChange`) y
 * pone la acción ("Apartar asiento 6") en su `FloatingBar` (AN-03). El mapa
 * ocupa su altura y se desplaza con la pantalla, sin scroll interno (AU-22).
 *
 * Asientos: disponible blanco con relieve; ocupado hundido en `surfaceDark`; elegido
 * azul con su resplandor, para que la selección se vea desde lejos. La leyenda usa la
 * misma forma.
 *
 * El mapa se dibuja como el bus visto desde arriba, con el frente hacia arriba,
 * para que la persona se ubique: parabrisas, chofer adelante a la izquierda, puerta
 * en la primera fila a la derecha (bus venezolano típico), pasillo central y fila
 * trasera de 5, con un asiento en el pasillo.
 * La distribución es la misma del panel (shared/asientos.ts). Cada
 * asiento lleva el respaldo abajo, que es hacia donde queda al mirar al frente.
 * La cabina es orientativa: la base de datos no guarda la distribución real.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowClockwise, DoorOpen, SteeringWheel } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Aviso, Button, Text } from '@/src/components/ui';
import { distribucionAsientos, ubicacionAsiento } from '@/src/utils/asientos.generated';
import { mensajeAsientosTomados, ordenarAsientos } from '@/src/hooks/useCheckoutBoletos';
import { alpha, Colors, Gradients, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

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
const ESPACIO_ASIENTOS = Spacing.sm;
/** Del ancho de un asiento: la fila trasera puede llevar uno en el pasillo. */
const ANCHO_PASILLO = SEAT_SIZE;
/** Dos asientos y el espacio entre ellos: un lado del bus. */
const ANCHO_LADO = SEAT_SIZE * 2 + ESPACIO_ASIENTOS;
/** Los dos lados y el pasillo, con su espacio a cada lado. */
const ANCHO_INTERIOR = ANCHO_LADO * 2 + ANCHO_PASILLO + ESPACIO_ASIENTOS * 2;
const MARGEN_INTERIOR = Spacing.lg;

type TipoAsiento = 'libre' | 'ocupado' | 'elegido';

const COLORES: Record<TipoAsiento, { bg: string; border: string; fg: string }> = {
  libre: { bg: Colors.background, border: Colors.borderControl, fg: Colors.foreground },
  ocupado: { bg: Colors.surfaceDark, border: Colors.surfaceDark, fg: Colors.placeholder },
  elegido: { bg: Colors.accentStrong, border: Colors.accentStrong, fg: Colors.accentStrongForeground },
};

// ─── Asiento ─────────────────────────────────────────────────────────────────

function SeatButton({
  seat,
  ubicacion,
  ocupado,
  seleccionado,
  bloqueado,
  onToggle,
}: {
  seat: string;
  ubicacion: 'ventana' | 'pasillo';
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
        style={[
          s.seat,
          { backgroundColor: colores.bg, borderColor: colores.border },
          seleccionado ? Shadows.sky : !ocupado ? Shadows.subtle : null,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado || bloqueado, selected: seleccionado }}
        accessibilityLabel={`Asiento ${seat}, ${ubicacion}${
          ocupado ? ', ocupado' : seleccionado ? ', elegido' : ', disponible'
        }`}
      >
        <Text variant="label" weight={seleccionado ? 'bold' : 'semibold'} color={colores.fg} compact>
          {seat}
        </Text>
        <View style={[s.respaldo, { backgroundColor: alpha(colores.fg, seleccionado ? 0.5 : 0.22) }]} />
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
  const { filas } = useMemo(() => distribucionAsientos(asientosTotales), [asientosTotales]);

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

  const asiento = (seat: string, colIndex: number) => (
    <SeatButton
      key={seat}
      seat={seat}
      ubicacion={ubicacionAsiento(colIndex)}
      ocupado={asientosOcupados.includes(seat)}
      seleccionado={seleccionados.includes(seat)}
      bloqueado={mapaBloqueado}
      onToggle={toggleSeat}
    />
  );

  return (
    <View>
      {errorOcupados ? (
        <Aviso
          tono="danger"
          titulo="No pudimos ver qué asientos están libres"
          texto={errorOcupados}
          alerta
          style={s.aviso}
          extra={
            onReintentarOcupados ? (
              <Button
                variant="outline"
                size="sm"
                icon={ArrowClockwise}
                onPress={onReintentarOcupados}
                style={s.reintentar}
              >
                Reintentar
              </Button>
            ) : null
          }
        />
      ) : null}

      {avisoTomados || limiteAlcanzado ? (
        <Aviso
          tono="warning"
          texto={avisoTomados ?? `Puedes apartar hasta ${MAX_ASIENTOS} asientos por compra.`}
          alerta
          style={s.aviso}
        />
      ) : null}

      <View style={s.leyenda}>
        <Leyenda tipo="libre" label="Libre" />
        <Leyenda tipo="elegido" label="Elegido" />
        <Leyenda tipo="ocupado" label="Ocupado" />
      </View>

      <View style={s.bus} accessibilityLabel="Mapa de asientos. El frente del bus está arriba.">
        <View style={s.parabrisas}>
          <LinearGradient colors={[...Gradients.skySoft]} style={StyleSheet.absoluteFill} />
          <Text variant="caption" weight="medium" color="infoText" align="center" compact>
            Frente del bus
          </Text>
        </View>

        <View style={s.interior}>
          <View style={s.franjaPasillo} />

          <View style={s.cabina}>
            <View
              style={[s.puesto, s.chofer]}
              accessible
              accessibilityLabel="Chofer, adelante a la izquierda"
            >
              <SteeringWheel size={Sizes.icon.md} color={Colors.mutedForeground} weight="duotone" />
              <Text variant="caption" color="muted" compact>
                Chofer
              </Text>
            </View>
          </View>

          {filas.map((fila, rowIndex) => (
            <View key={`fila-${rowIndex}`} style={s.fila}>
              {fila.map((seat, colIndex) => {
                // Primera fila: la puerta ocupa la derecha (el asiento 3 va una fila más atrás).
                if (rowIndex === 0 && colIndex === 3 && !seat && !fila[4]) {
                  return (
                    <View
                      key="puerta"
                      style={[s.puesto, s.puerta]}
                      accessible
                      accessibilityLabel="Puerta, adelante a la derecha"
                    >
                      <DoorOpen size={Sizes.icon.md} color={Colors.primaryText} weight="duotone" />
                      <Text variant="caption" weight="semibold" color="primaryText" compact>
                        Puerta
                      </Text>
                      {/* El hueco de la puerta en la carrocería. */}
                      <View style={s.huecoPuerta} />
                    </View>
                  );
                }
                if (rowIndex === 0 && colIndex === 4 && !seat && !fila[3]) return null;
                if (seat) return asiento(seat, colIndex);
                return (
                  <View
                    key={`${colIndex === 2 ? 'pasillo' : 'hueco'}-${rowIndex}-${colIndex}`}
                    style={colIndex === 2 ? s.pasillo : s.hueco}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <Text variant="caption" color="muted" align="center" style={s.trasera}>
          Parte trasera
        </Text>
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
    marginBottom: Spacing.lg,
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
    borderWidth: Sizes.hairline,
  },
  // La carrocería abraza los asientos, así el mapa se lee como un bus y no como una
  // tarjeta: el frente más redondeado que la cola.
  bus: {
    alignSelf: 'center',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['3xl'] + Spacing.md,
    borderTopRightRadius: Radius['3xl'] + Spacing.md,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: MARGEN_INTERIOR,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    ...Shadows.raised,
  },
  parabrisas: {
    width: ANCHO_INTERIOR,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderBottomLeftRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
    borderCurve: 'continuous',
  },
  interior: {
    width: ANCHO_INTERIOR,
  },
  franjaPasillo: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: (ANCHO_INTERIOR - ANCHO_PASILLO) / 2,
    width: ANCHO_PASILLO,
    backgroundColor: Colors.surface,
  },
  cabina: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  puesto: {
    width: ANCHO_LADO,
    height: SEAT_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  chofer: {
    backgroundColor: Colors.surface,
  },
  puerta: {
    backgroundColor: Colors.primarySoft,
  },
  huecoPuerta: {
    position: 'absolute',
    top: Spacing.xs,
    bottom: Spacing.xs,
    right: -MARGEN_INTERIOR,
    width: Sizes.borderSelected + Sizes.hairline,
    borderTopLeftRadius: Radius.full,
    borderBottomLeftRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: ESPACIO_ASIENTOS,
    marginBottom: ESPACIO_ASIENTOS,
  },
  seat: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: Radius.sm + Spacing.xs / 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Sizes.hairline,
    paddingBottom: Spacing.xs,
  },
  // Abajo: el respaldo queda detrás de quien mira al frente del bus.
  respaldo: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.md,
    right: Spacing.md,
    height: Sizes.borderSelected,
    borderRadius: Radius.full,
  },
  hueco: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
  },
  pasillo: {
    width: ANCHO_PASILLO,
    height: SEAT_SIZE,
  },
  trasera: {
    marginTop: Spacing.sm,
  },
});
