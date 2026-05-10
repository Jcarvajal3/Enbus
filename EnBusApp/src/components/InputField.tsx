/**
 * InputField — Maia Preset
 * Wrapper confiable para TextInput con borde visible garantizado en Android/iOS.
 * NO usa border-* de Tailwind (falla con CSS variables en React Native).
 * Usa StyleSheet + colores hardcodeados del Maia Neutral preset.
 */
import React from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';

interface InputFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: ViewStyle;
  multiline?: boolean;
}

// Colores del Maia Neutral preset (hardcodeados para React Native)
const COLORS = {
  background: '#ffffff',
  border: '#d4d4d8',     // zinc-300 — visible en pantallas móviles
  text: '#171717',       // foreground
  placeholder: '#a1a1aa', // zinc-400
  label: '#404040',      // foreground-muted
  radius: 10,
};

export function InputField({ label, containerStyle, multiline, style, ...props }: InputFieldProps) {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, multiline && styles.multilineContainer]}>
        <RNTextInput
          placeholderTextColor={COLORS.placeholder}
          style={[styles.input, multiline && styles.multilineInput, style]}
          multiline={multiline}
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.label,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  inputContainer: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: COLORS.radius,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  multilineContainer: {
    height: undefined,
    minHeight: 88,
    justifyContent: 'flex-start',
    paddingVertical: 12,
  },
  input: {
    fontSize: 15,
    color: COLORS.text,
    padding: 0,          // Reset Android default padding
    margin: 0,
    flex: 1,
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
});
