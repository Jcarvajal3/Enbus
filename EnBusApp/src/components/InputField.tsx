/**
 * InputField — Componente de campo de entrada unificado
 *
 * - Estado de foco: borde animado vía Reanimated interpolateColor
 * - Usa exclusivamente tokens de @/src/theme — sin paleta local
 * - API pública sin cambios (compatible con todos los usos existentes)
 */
import React from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radius } from '@/src/theme';

interface InputFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  multiline?: boolean;
}

export function InputField({
  label,
  containerStyle,
  inputContainerStyle,
  labelStyle,
  multiline,
  style,
  onFocus,
  onBlur,
  ...props
}: InputFieldProps) {
  const focusProgress = useSharedValue(0);

  const animatedBorderStyle = useAnimatedStyle(() => {
    // If border is disabled via override, don't animate the border color
    if (inputContainerStyle && (inputContainerStyle.borderWidth === 0 || inputContainerStyle.borderWidth === null)) {
      return {};
    }
    return {
      borderColor: interpolateColor(
        focusProgress.value,
        [0, 1],
        [Colors.border, Colors.primary]
      ),
    };
  });

  const handleFocus = (e: any) => {
    focusProgress.value = withTiming(1, { duration: 200 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    focusProgress.value = withTiming(0, { duration: 150 });
    onBlur?.(e);
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
      <Animated.View
        style={[
          styles.inputContainer,
          multiline && styles.multilineContainer,
          animatedBorderStyle,
          inputContainerStyle,
        ]}
      >
        <RNTextInput
          placeholderTextColor={Colors.mutedForeground}
          style={[styles.input, multiline && styles.multilineInput, style]}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
    marginBottom: Spacing.xs,
    letterSpacing: 0.1,
  },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    height: Spacing['5xl'],
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg - 2,
  },
  multilineContainer: {
    height: undefined,
    minHeight: 88,
    justifyContent: 'flex-start',
    paddingVertical: Spacing.md,
  },
  input: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    color: Colors.foreground,
    padding: 0,
    margin: 0,
    flex: 1,
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
});
