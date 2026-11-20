/**
 * TelefonoField — teléfono venezolano con máscara en vivo (APP-43, #57).
 *
 * Teclado de teléfono; mientras se escribe muestra "0414-123.45.67" (`editarTelefono`
 * de `shared`, igual que el panel). Acepta
 * "+58 414 1234567" o "414…" (pegado o escrito) y lo pasa a la forma local.
 * Emite "0414-1234567" (la forma en que se guarda) cuando el número es válido;
 * mientras no, lo que se ve ("0414-123"). Validar con `telefonoValido` /
 * `validatePhone` de `src/utils/validation.ts`.
 */
import React, { type Ref } from 'react';
import type { ReturnKeyTypeOptions, TextInput, TextInputProps, ViewStyle } from 'react-native';
import { Phone } from 'phosphor-react-native';
import { Field, type FieldTone } from '@/src/components/ui';
import {
  editarTelefono,
  mostrarTelefono,
  telefonoParaGuardar,
  TELEFONO_PLACEHOLDER,
} from '@/src/utils/ve.generated';

export interface TelefonoFieldProps {
  label?: string;
  value: string;
  onChangeText(v: string): void;
  error?: string | null;
  helper?: string;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  editable?: boolean;
  /** Mismo `tone` que los demás campos de la tarjeta. Por defecto `sunken`. */
  tone?: FieldTone;
  /** Al `TextInput` (para encadenar "Siguiente"). */
  ref?: Ref<TextInput>;
  /** `submit` mantiene el teclado al pasar al campo siguiente. */
  submitBehavior?: TextInputProps['submitBehavior'];
  /** Por defecto `tel`; `off` cuando no es el teléfono de quien usa la app. */
  autoComplete?: TextInputProps['autoComplete'];
  containerStyle?: ViewStyle;
}

export function TelefonoField({
  label = 'Teléfono',
  value,
  onChangeText,
  error,
  helper,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  tone,
  ref,
  submitBehavior,
  autoComplete = 'tel',
  containerStyle,
}: TelefonoFieldProps) {
  // Los marcadores 'PENDIENTE-…' del alta con Google no son un teléfono: `mostrarTelefono`
  // los deja vacíos. La edición (máscara, prefijo +58, borrar separadores) es de `shared`.
  const visible = mostrarTelefono(value);

  const cambiar = (texto: string) => {
    const mascara = editarTelefono(visible, texto);
    onChangeText(telefonoParaGuardar(mascara) ?? mascara);
  };

  return (
    <Field
      ref={ref}
      label={label}
      icon={Phone}
      value={visible}
      onChangeText={cambiar}
      placeholder={TELEFONO_PLACEHOLDER}
      keyboardType="phone-pad"
      inputMode="tel"
      textContentType="telephoneNumber"
      autoComplete={autoComplete}
      autoCorrect={false}
      returnKeyType={returnKeyType}
      submitBehavior={submitBehavior}
      containerStyle={containerStyle}
      onSubmitEditing={onSubmitEditing}
      editable={editable}
      tone={tone}
      error={error ?? undefined}
      helper={helper}
    />
  );
}
