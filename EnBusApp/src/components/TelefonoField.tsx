/**
 * TelefonoField — teléfono venezolano con máscara en vivo (APP-43, #57).
 *
 * Teclado de teléfono; mientras se escribe muestra "0414-123.45.67". Acepta
 * "+58 414 1234567" o "414…" (pegado o escrito) y lo pasa a la forma local.
 * Emite "0414-1234567" (la forma en que se guarda) cuando el número es válido;
 * mientras no, lo que se ve ("0414-123"). Validar con `telefonoValido` /
 * `validatePhone` de `src/utils/validation.ts`.
 */
import React, { type Ref } from 'react';
import type { ReturnKeyTypeOptions, TextInput } from 'react-native';
import { Phone } from 'phosphor-react-native';
import { Field } from '@/src/components/ui';
import { mascaraTelefono, telefonoParaGuardar } from '@/src/utils/ve.generated';

export interface TelefonoFieldProps {
  label?: string;
  value: string;
  onChangeText(v: string): void;
  error?: string | null;
  helper?: string;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  editable?: boolean;
  /** Al `TextInput` (para encadenar "Siguiente"). */
  ref?: Ref<TextInput>;
}

const digitos = (v: string) => v.replace(/\D/g, '');

/** "+", "+5", "+58": el prefijo internacional a medio escribir se deja tal cual. */
const prefijoEnCurso = (v: string) => /^\s*\+\s*5?8?\s*$/.test(v);

export function TelefonoField({
  label = 'Teléfono',
  value,
  onChangeText,
  error,
  helper,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  ref,
}: TelefonoFieldProps) {
  // Los marcadores 'PENDIENTE-…' del alta con Google no son un teléfono.
  const crudo = /^\s*pendiente/i.test(value ?? '') ? '' : value ?? '';
  const visible = prefijoEnCurso(crudo) ? crudo.trim() : mascaraTelefono(crudo);

  const cambiar = (texto: string) => {
    if (prefijoEnCurso(texto)) {
      onChangeText(texto.trim());
      return;
    }
    let entrada = texto;
    // Al borrar un separador ("0414-" → "0414") la máscara lo volvería a poner:
    // se borra también el último dígito.
    if (texto.length < visible.length && digitos(texto) === digitos(visible)) {
      entrada = digitos(texto).slice(0, -1);
    }
    const mascara = mascaraTelefono(entrada);
    onChangeText(telefonoParaGuardar(mascara) ?? mascara);
  };

  return (
    <Field
      ref={ref}
      label={label}
      icon={Phone}
      value={visible}
      onChangeText={cambiar}
      placeholder="0414-1234567"
      keyboardType="phone-pad"
      inputMode="tel"
      textContentType="telephoneNumber"
      autoComplete="tel"
      autoCorrect={false}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      editable={editable}
      error={error ?? undefined}
      helper={helper}
    />
  );
}
