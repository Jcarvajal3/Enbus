/**
 * RouteField — el único selector de ruta: Inicio, paso 1 de la compra y paso 1 del
 * envío.
 *
 * Es lo más importante de la compra, y se ve: un solo bloque con el camino dibujado
 * (punto de salida, línea, pin de llegada) y la ciudad en grande. Cada fila abre
 * `LocationSelector`. Con `onIntercambiar`, el botón ⇅ sobre la línea que las separa.
 *
 *   <RouteField origen={o} destino={d} onOrigen={setO} onDestino={setD}
 *     onIntercambiar={intercambiar} recientes={recientes} populares={CIUDADES_POPULARES} />
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowsDownUp, MapPin } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LocationSelector } from './LocationSelector';
import { PressableScale } from './PressableScale';
import { Text } from '@/src/components/ui';
import type { Localidad } from '@/src/utils/venezuela';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export function RouteField({
  origen,
  destino,
  onOrigen,
  onDestino,
  onIntercambiar,
  origenes,
  destinos,
  recientes,
  populares,
  disabled = false,
  error,
  registrarAbrirDestino,
}: {
  origen: Localidad | null;
  destino: Localidad | null;
  onOrigen(l: Localidad): void;
  onDestino(l: Localidad): void;
  /** Botón ⇅; oculto si falta */
  onIntercambiar?: () => void;
  /** Ciudades de origen que se ofrecen (por defecto, el catálogo y las de las rutas activas) */
  origenes?: Localidad[];
  /** Ciudades de destino que se ofrecen (por defecto, el catálogo y las de las rutas activas) */
  destinos?: Localidad[];
  recientes?: Localidad[];
  populares?: Localidad[];
  disabled?: boolean;
  error?: string | null;
  /**
   * Recibe la función que abre la hoja del destino, para abrirla desde otro
   * sitio (p. ej. "Cambiar destino" cuando la ruta no tiene salidas).
   */
  registrarAbrirDestino?: (abrir: () => void) => void;
}) {
  const reduceMotion = useReducedMotion();
  const giro = useSharedValue(0);
  const giroStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }));

  const intercambiar = () => {
    if (!onIntercambiar || disabled) return;
    // Con "reducir movimiento" la flecha no gira: solo se intercambian las ciudades.
    if (!reduceMotion) {
      giro.value = withTiming(giro.value + 180, {
        duration: Motion.duration.base,
        easing: Motion.easing.out,
      });
    }
    onIntercambiar();
  };

  return (
    <View>
      <View style={s.bloque}>
        <LocationSelector
          label="Origen"
          value={origen}
          onChange={onOrigen}
          opciones={origenes}
          excluir={destino}
          excluirAyuda="Ya es tu destino"
          recientes={recientes}
          populares={populares}
          customTrigger={(abrir) => (
            <Fila
              etiqueta="Origen"
              valor={origen?.ciudad}
              extremo="salida"
              onPress={abrir}
              disabled={disabled}
              conIntercambio={!!onIntercambiar}
            />
          )}
        />

        <View style={s.separador} />

        <LocationSelector
          label="Destino"
          value={destino}
          onChange={onDestino}
          opciones={destinos}
          excluir={origen}
          excluirAyuda="Ya es tu origen"
          recientes={recientes}
          populares={populares}
          customTrigger={(abrir) => (
            <Fila
              etiqueta="Destino"
              valor={destino?.ciudad}
              extremo="llegada"
              onPress={abrir}
              disabled={disabled}
              conIntercambio={!!onIntercambiar}
              registrarAbrir={registrarAbrirDestino}
            />
          )}
        />

        {/* El camino: une el punto de salida con el pin de llegada. */}
        <View style={s.camino} pointerEvents="none" />

        {onIntercambiar ? (
          <PressableScale
            onPress={intercambiar}
            disabled={disabled}
            haptic
            hapticType="selection"
            scaleValue={Motion.press.icon}
            style={s.intercambio}
            accessibilityRole="button"
            accessibilityLabel="Intercambiar origen y destino"
          >
            <Animated.View style={giroStyle}>
              <ArrowsDownUp size={Sizes.icon.md} color={Colors.accentStrong} weight="bold" />
            </Animated.View>
          </PressableScale>
        ) : null}
      </View>

      {error ? (
        <Text
          variant="caption"
          weight="medium"
          color="dangerText"
          style={s.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Fila({
  etiqueta,
  valor,
  extremo,
  onPress,
  disabled,
  conIntercambio,
  registrarAbrir,
}: {
  etiqueta: string;
  valor?: string;
  extremo: 'salida' | 'llegada';
  onPress: () => void;
  disabled: boolean;
  conIntercambio: boolean;
  registrarAbrir?: (abrir: () => void) => void;
}) {
  useEffect(() => {
    registrarAbrir?.(onPress);
  }, [registrarAbrir, onPress]);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      dimWhenDisabled={false}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={[s.fila, conIntercambio && s.filaConIntercambio]}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}: ${valor ?? 'sin elegir'}`}
      accessibilityState={{ disabled }}
    >
      <View style={s.marcador}>
        {extremo === 'salida' ? (
          <View style={[s.puntoSalida, disabled && s.apagado]} />
        ) : (
          <MapPin
            size={Sizes.icon.md}
            color={disabled ? Colors.mutedForeground : Colors.secondaryDeep}
            weight="fill"
          />
        )}
      </View>
      <View style={s.textos}>
        <Text variant="caption" color="muted" compact>
          {etiqueta}
        </Text>
        {valor ? (
          <Text variant="heading" color={disabled ? 'muted' : 'foreground'} numberOfLines={1}>
            {valor}
          </Text>
        ) : (
          <Text variant="body" size="lg" color={Colors.placeholder} numberOfLines={1} style={s.vacio}>
            Elige la ciudad
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

/** Ancho de la columna del marcador: el camino pasa por su centro. */
const MARCADOR = Sizes.icon.lg;
const PUNTO = Spacing.md;
const FILA = Sizes.control.xl + Spacing.md;

const s = StyleSheet.create({
  bloque: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: FILA,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  /** Deja libre el botón ⇅, que flota a la derecha entre las dos filas. */
  filaConIntercambio: {
    paddingRight: Sizes.touchTarget + Spacing['2xl'],
  },
  marcador: {
    width: MARCADOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puntoSalida: {
    width: PUNTO,
    height: PUNTO,
    borderRadius: Radius.full,
    borderWidth: Sizes.borderSelected + Sizes.hairline,
    borderColor: Colors.accentStrong,
    backgroundColor: Colors.background,
  },
  apagado: {
    borderColor: Colors.mutedForeground,
  },
  textos: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  vacio: {
    marginTop: Spacing.xs / 2,
  },
  separador: {
    height: Sizes.hairline,
    backgroundColor: Colors.surfaceDark,
    marginLeft: Spacing.lg + MARCADOR + Spacing.md,
  },
  camino: {
    position: 'absolute',
    left: Spacing.lg + MARCADOR / 2 - Sizes.hairline,
    top: FILA / 2 + PUNTO,
    bottom: FILA / 2 + PUNTO,
    width: Sizes.borderSelected,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceDark,
  },
  intercambio: {
    position: 'absolute',
    right: Spacing.md,
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  error: {
    marginTop: Spacing.sm,
  },
});
