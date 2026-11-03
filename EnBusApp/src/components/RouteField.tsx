/**
 * RouteField — el único selector de ruta (D10, AU-15, AN-31): Inicio, paso 1
 * de la compra y paso 1 del envío.
 *
 * Dos tarjetas apiladas, "Origen" y "Destino", con el marcador "Elige la
 * ciudad"; cada una abre `LocationSelector`. Iconos neutros (origen `Circle`
 * bold, destino `MapPin` fill, ambos `foreground` en un círculo `surface`) y,
 * con `onIntercambiar`, el botón ⇅ entre las dos.
 *
 *   <RouteField origen={o} destino={d} onOrigen={setO} onDestino={setD}
 *     onIntercambiar={intercambiar} recientes={recientes} populares={CIUDADES_POPULARES} />
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowsDownUp, Circle, MapPin, type IconProps } from 'phosphor-react-native';
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
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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
  /** Ciudades de origen que se ofrecen (por defecto, todas) */
  origenes?: Localidad[];
  /** Ciudades de destino que se ofrecen (por defecto, todas) */
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
      <View style={s.pila}>
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
            <Tarjeta
              etiqueta="Origen"
              valor={origen?.ciudad}
              icono={Circle}
              peso="bold"
              onPress={abrir}
              disabled={disabled}
              conIntercambio={!!onIntercambiar}
            />
          )}
        />
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
            <Tarjeta
              etiqueta="Destino"
              valor={destino?.ciudad}
              icono={MapPin}
              peso="fill"
              onPress={abrir}
              disabled={disabled}
              conIntercambio={!!onIntercambiar}
              registrarAbrir={registrarAbrirDestino}
            />
          )}
        />

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
              <ArrowsDownUp size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
            </Animated.View>
          </PressableScale>
        ) : null}
      </View>

      {error ? (
        <Text
          variant="caption"
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

function Tarjeta({
  etiqueta,
  valor,
  icono: Icono,
  peso,
  onPress,
  disabled,
  conIntercambio,
  registrarAbrir,
}: {
  etiqueta: string;
  valor?: string;
  icono: React.ComponentType<IconProps>;
  peso: IconProps['weight'];
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
      scaleValue={Motion.press.button}
      style={[s.tarjeta, conIntercambio && s.tarjetaConIntercambio]}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}: ${valor ?? 'sin elegir'}`}
      accessibilityState={{ disabled }}
    >
      <View style={s.icono}>
        <Icono size={Sizes.icon.sm} color={disabled ? Colors.mutedForeground : Colors.foreground} weight={peso} />
      </View>
      <View style={s.textos}>
        <Text variant="caption" color="muted" compact>
          {etiqueta}
        </Text>
        <Text
          variant="bodyStrong"
          color={valor && !disabled ? 'foreground' : 'muted'}
          numberOfLines={1}
        >
          {valor ?? 'Elige la ciudad'}
        </Text>
      </View>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  pila: {
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.control.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.background,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
  /** Deja libre el botón ⇅, que flota a la derecha entre las dos tarjetas. */
  tarjetaConIntercambio: {
    paddingRight: Sizes.touchTarget + Spacing['2xl'],
  },
  icono: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: {
    flex: 1,
  },
  intercambio: {
    position: 'absolute',
    right: Spacing.lg,
    top: '50%',
    marginTop: -Sizes.touchTarget / 2,
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: Sizes.hairline,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    marginTop: Spacing.sm,
    marginLeft: Spacing.lg,
  },
});
