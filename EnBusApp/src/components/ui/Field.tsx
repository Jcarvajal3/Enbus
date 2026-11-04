/**
 * Field — the single text input, and SelectField, its non-typing sibling.
 *
 * Un campo es un pozo: relleno `surface`, esquinas `md`, sin ruido. Con valor sube a
 * blanco con borde, y el texto pasa a semibold: se distingue por la caja y por el
 * texto. Al enfocarlo, blanco con borde azul y anillo. Los errores se muestran en
 * línea (en `dangerText`), no solo en un aviso que desaparece.
 *
 * Alineación: etiqueta, caja y ayuda/error comparten el mismo borde izquierdo.
 *
 * Accesibilidad: el `TextInput` lleva la etiqueta como `accessibilityLabel` y la
 * ayuda como `accessibilityHint`; el error se anuncia solo.
 */
import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { CaretDown, Eye, EyeSlash, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '../PressableScale';
import { Text, fontStyle } from './Text';
import { alpha, Colors, Motion, Opacity, Radius, Sizes, Spacing } from '@/src/theme';

export type FieldTone = 'light' | 'sunken';

export interface FieldProps extends Omit<TextInputProps, 'style' | 'placeholder'> {
  label?: string;
  /** Obligatorio: un campo vacío siempre dice qué se espera ("Ej. María Pérez"). */
  placeholder: string;
  /** Inline validation message — replaces the border with the danger colour */
  error?: string;
  /** Persistent hint under the input */
  helper?: string;
  /** Leading icon inside the input */
  icon?: React.ComponentType<IconProps>;
  /** `sunken` (por defecto) = pozo dentro de algo blanco; `light` = blanco sobre `canvas` */
  tone?: FieldTone;
  containerStyle?: ViewStyle;
  /**
   * No pinta el mensaje bajo el campo (el error sigue marcando el borde): para
   * compuestos como `CedulaField`, que lo ponen a todo el ancho.
   */
  sinMensaje?: boolean;
}

const BACKGROUNDS: Record<FieldTone, string> = {
  light: Colors.white,
  sunken: Colors.surface,
};

/** Anillo de foco alrededor del borde azul. */
const SOMBRA_FOCO = `0px 0px 0px 4px ${alpha(Colors.accentStrong, 0.14)}`;
const SIN_SOMBRA = `0px 0px 0px 0px ${alpha(Colors.accentStrong, 0)}`;

/** Error visible y anunciado en cuanto aparece; si no, la ayuda. */
export function FieldMessage({ error, helper }: { error?: string | null; helper?: string | null }) {
  if (error) {
    return (
      <Text
        variant="caption"
        weight="medium"
        color="dangerText"
        style={s.message}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        {error}
      </Text>
    );
  }
  if (helper) {
    return (
      <Text variant="caption" color="muted" style={s.message}>
        {helper}
      </Text>
    );
  }
  return null;
}

export function Field({
  label,
  error,
  helper,
  icon: Icon,
  tone = 'sunken',
  containerStyle,
  sinMensaje,
  multiline,
  secureTextEntry,
  editable = true,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [enFoco, setEnFoco] = useState(false);
  const focus = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const isPassword = !!secureTextEntry;
  const conValor = typeof rest.value === 'string' ? rest.value.length > 0 : !!rest.defaultValue;
  const fondoReposo = conValor ? Colors.white : BACKGROUNDS[tone];
  const bordeReposo = conValor ? Colors.borderControl : tone === 'light' ? Colors.borderControl : Colors.surface;

  const borderStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focus.value, [0, 1], [fondoReposo, Colors.white]),
    borderColor: error
      ? Colors.dangerText
      : interpolateColor(focus.value, [0, 1], [bordeReposo, Colors.accentStrong]),
  }));

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    focus.value = reduceMotion ? 1 : withTiming(1, { duration: Motion.duration.fast });
    setEnFoco(true);
    onFocus?.(e);
  };

  const handleBlur: TextInputProps['onBlur'] = (e) => {
    focus.value = reduceMotion ? 0 : withTiming(0, { duration: Motion.duration.instant });
    setEnFoco(false);
    onBlur?.(e);
  };

  // La etiqueta visible es el nombre del campo; el error (si hay) y la ayuda
  // se leen como pista, así quien vuelve al campo sabe qué corregir.
  const a11yLabel = accessibilityLabel ?? label;
  const a11yHint = accessibilityHint ?? ([error, helper].filter(Boolean).join('. ') || undefined);

  return (
    <View style={[s.wrapper, containerStyle]}>
      {label ? (
        // El `TextInput` ya lleva la etiqueta: aquí se oculta para no leerla dos veces.
        <Text
          variant="label"
          style={s.label}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {label}
        </Text>
      ) : null}

      <Animated.View
        style={[
          s.box,
          {
            opacity: editable ? Opacity.full : Opacity.dimmed,
            boxShadow: enFoco ? SOMBRA_FOCO : SIN_SOMBRA,
          },
          multiline ? s.boxMultiline : null,
          borderStyle,
        ]}
      >
        {Icon && (
          <Icon
            size={Sizes.icon.md}
            color={enFoco ? Colors.accentStrong : Colors.mutedForeground}
            weight={enFoco ? 'fill' : 'regular'}
          />
        )}

        <TextInput
          {...rest}
          accessibilityLabel={a11yLabel}
          accessibilityHint={a11yHint}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          multiline={multiline}
          secureTextEntry={isPassword && !revealed}
          placeholderTextColor={Colors.placeholder}
          selectionColor={Colors.accentStrong}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            s.input,
            conValor ? s.inputConValor : null,
            multiline ? s.inputMultiline : null,
            WEB_SIN_ANILLO,
          ]}
        />

        {isPassword && (
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync();
              setRevealed((v) => !v);
            }}
            scaleValue={Motion.press.icon}
            style={s.adornment}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {revealed ? (
              <EyeSlash color={Colors.mutedForeground} size={Sizes.icon.md} />
            ) : (
              <Eye color={Colors.mutedForeground} size={Sizes.icon.md} />
            )}
          </PressableScale>
        )}
      </Animated.View>

      {sinMensaje ? null : <FieldMessage error={error} helper={helper} />}
    </View>
  );
}

/**
 * En web el `TextInput` dibuja su propio anillo de foco dentro de la caja (doble
 * anillo); el borde animado ya marca el foco.
 */
const WEB_SIN_ANILLO = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

// ─── SelectField ─────────────────────────────────────────────────────────────

/**
 * Looks exactly like a `Field` but opens a picker instead of a keyboard — used for
 * the bank selector, dates and locations.
 */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  icon: Icon,
  tone = 'sunken',
  disabled,
  helper,
  error,
  containerStyle,
}: {
  label?: string;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  icon?: React.ComponentType<IconProps>;
  tone?: FieldTone;
  disabled?: boolean;
  helper?: string;
  error?: string;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[s.wrapper, containerStyle]}>
      {label ? (
        <Text
          variant="label"
          style={s.label}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {label}
        </Text>
      ) : null}

      <PressableScale
        onPress={onPress}
        disabled={disabled}
        haptic
        hapticType="selection"
        scaleValue={Motion.press.button}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? placeholder}: ${value || placeholder}`}
        accessibilityHint={[error, helper].filter(Boolean).join('. ') || undefined}
        accessibilityState={{ disabled: !!disabled }}
        style={[
          s.box,
          {
            backgroundColor: value ? Colors.white : BACKGROUNDS[tone],
            borderColor: error
              ? Colors.dangerText
              : value
                ? Colors.borderControl
                : tone === 'light'
                  ? Colors.borderControl
                  : Colors.surface,
            opacity: disabled ? Opacity.dimmed : Opacity.full,
          },
        ]}
      >
        {Icon && (
          <Icon
            size={Sizes.icon.md}
            color={disabled ? Colors.mutedForeground : Colors.foreground}
            weight="regular"
          />
        )}
        <View style={s.selectLabel}>
          <Text
            variant={value ? 'bodyStrong' : 'body'}
            color={value ? 'foreground' : Colors.placeholder}
            numberOfLines={1}
            compact
          >
            {value || placeholder}
          </Text>
        </View>
        <CaretDown size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
      </PressableScale>

      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.control.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.surface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  boxMultiline: {
    minHeight: Sizes.control.lg * 2,
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },
  input: {
    flex: 1,
    ...fontStyle('base', 'regular'),
    color: Colors.foreground,
    padding: 0,
    margin: 0,
  },
  inputConValor: {
    ...fontStyle('base', 'medium'),
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: Sizes.control.lg,
  },
  adornment: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
    marginRight: -Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectLabel: {
    flex: 1,
  },
  message: {
    marginTop: Spacing.sm,
  },
});
