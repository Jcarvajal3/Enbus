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
} from 'react-native-reanimated';
import { CaretDown, Eye, EyeSlash, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '../PressableScale';
import { Text, fontStyle } from './Text';
import { Colors, Motion, Opacity, Radius, Sizes, Spacing } from '@/src/theme';

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
  ...rest
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  const focus = useSharedValue(0);

  const isPassword = !!secureTextEntry;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? Colors.destructive
      : interpolateColor(focus.value, [0, 1], [Colors.transparent, Colors.accent]),
  }));

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    focus.value = withTiming(1, { duration: Motion.duration.fast });
    onFocus?.(e);
  };

  const handleBlur: TextInputProps['onBlur'] = (e) => {
    focus.value = withTiming(0, { duration: Motion.duration.instant });
    onBlur?.(e);
  };

  return (
    <View style={[s.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" style={s.label}>
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

      {error ? (
        <Text variant="caption" color="danger" style={s.message}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="muted" style={s.message}>
          {helper}
        </Text>
      ) : null}
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
        <Text variant="label" style={s.label}>
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
        accessibilityState={{ disabled: !!disabled }}
        style={[
          s.box,
          {
            backgroundColor: BACKGROUNDS[tone],
            borderRadius: Radius.full,
            borderColor: error ? Colors.destructive : Colors.transparent,
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

      {error ? (
        <Text variant="caption" color="danger" style={s.message}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="muted" style={s.message}>
          {helper}
        </Text>
      ) : null}
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
