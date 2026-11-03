/**
 * Field — the single text input, and SelectField, its non-typing sibling.
 *
 * Five different inputs existed: `InputField` (beige, 10pt radius, 1.5pt
 * border), the private `Field` in login (white, pill, no border), `BrandInput`
 * in encomiendas/nueva (white, pill, uppercase label), and bare `TextInput`s in
 * PaymentFlow, recuperar and boletos/[id]. Same job, five appearances.
 *
 * The rule encoded here: single-line inputs are pills, multiline inputs use the
 * large radius, the focused border is always the accent colour, and errors are
 * shown inline rather than only as a toast.
 *
 * Accesibilidad (APP-57): el `TextInput` lleva la etiqueta como
 * `accessibilityLabel` y la ayuda como `accessibilityHint` (TalkBack leía el
 * placeholder); el error se anuncia solo (`accessibilityLiveRegion` +
 * `role="alert"`). En tono `light` el campo tiene borde en reposo (≥ 3:1 sobre
 * blanco), así se distingue del fondo.
 */
import React, { useState } from 'react';
import {
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
import { Colors, Motion, Opacity, Radius, Sizes, Spacing, alpha } from '@/src/theme';

export type FieldTone = 'light' | 'sunken';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Inline validation message — replaces the border with the danger colour */
  error?: string;
  /** Persistent hint under the input */
  helper?: string;
  /** Leading icon inside the input */
  icon?: React.ComponentType<IconProps>;
  /** `light` = white on a beige surface, `sunken` = beige on a white surface */
  tone?: FieldTone;
  containerStyle?: ViewStyle;
}

const BACKGROUNDS: Record<FieldTone, string> = {
  light: Colors.white,
  sunken: Colors.surface,
};

/**
 * Borde en reposo. `light` va sobre fondos blancos o beige: sin borde no se
 * ve el control (WCAG 1.4.11, ≥ 3:1). `sunken` ya se distingue por el relleno.
 */
const RESTING_BORDERS: Record<FieldTone, string> = {
  light: alpha(Colors.foreground, 0.45),
  sunken: Colors.transparent,
};

/** Error visible y anunciado en cuanto aparece; si no, la ayuda. */
function FieldMessage({ error, helper }: { error?: string; helper?: string }) {
  if (error) {
    return (
      <Text
        variant="caption"
        color="danger"
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
  tone = 'light',
  containerStyle,
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
  const focus = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const isPassword = !!secureTextEntry;
  const restingBorder = RESTING_BORDERS[tone];

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? Colors.destructive
      : interpolateColor(focus.value, [0, 1], [restingBorder, Colors.accent]),
  }));

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    focus.value = reduceMotion ? 1 : withTiming(1, { duration: Motion.duration.fast });
    onFocus?.(e);
  };

  const handleBlur: TextInputProps['onBlur'] = (e) => {
    focus.value = reduceMotion ? 0 : withTiming(0, { duration: Motion.duration.instant });
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
            backgroundColor: BACKGROUNDS[tone],
            borderRadius: multiline ? Radius.lg : Radius.full,
            opacity: editable ? Opacity.full : Opacity.dimmed,
          },
          multiline ? s.boxMultiline : null,
          borderStyle,
        ]}
      >
        {Icon && <Icon size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />}

        <TextInput
          {...rest}
          accessibilityLabel={a11yLabel}
          accessibilityHint={a11yHint}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          multiline={multiline}
          secureTextEntry={isPassword && !revealed}
          placeholderTextColor={Colors.mutedForeground}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[s.input, multiline ? s.inputMultiline : null]}
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
              <EyeSlash color={Colors.mutedForeground} size={Sizes.icon.lg} />
            ) : (
              <Eye color={Colors.mutedForeground} size={Sizes.icon.lg} />
            )}
          </PressableScale>
        )}
      </Animated.View>

      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

// ─── SelectField ─────────────────────────────────────────────────────────────

/**
 * Looks exactly like a `Field` but opens a picker instead of a keyboard —
 * used for the bank selector, dates and locations, which previously each
 * styled their own trigger.
 */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  icon: Icon,
  tone = 'light',
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
            backgroundColor: BACKGROUNDS[tone],
            borderRadius: Radius.full,
            borderColor: error ? Colors.destructive : RESTING_BORDERS[tone],
            opacity: disabled ? Opacity.dimmed : Opacity.full,
          },
        ]}
      >
        {Icon && (
          <Icon
            size={Sizes.icon.md}
            color={disabled ? Colors.mutedForeground : Colors.accent}
            weight="bold"
          />
        )}
        <View style={s.selectLabel}>
          <Text
            variant="bodyStrong"
            color={value ? 'foreground' : 'muted'}
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
    marginLeft: Spacing.xs,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.control.lg,
    paddingHorizontal: Spacing.xl,
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.transparent,
  },
  boxMultiline: {
    minHeight: Sizes.control.lg * 2,
    alignItems: 'flex-start',
    paddingVertical: Spacing.lg,
  },
  input: {
    flex: 1,
    ...fontStyle('base', 'medium'),
    color: Colors.foreground,
    padding: 0,
    margin: 0,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: Sizes.control.lg,
  },
  adornment: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectLabel: {
    flex: 1,
  },
  message: {
    marginTop: Spacing.xs + 2,
    marginLeft: Spacing.lg,
  },
});
