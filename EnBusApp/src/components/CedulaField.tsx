/**
 * CedulaField — cédula venezolana como letra + número (APP-05, #57).
 *
 * La letra se elige con botones ("V", "E"…) y el número se escribe con el
 * teclado numérico, así nadie tiene que adivinar el formato. Pegar
 * "v-12.345.678" separa la letra y el número. Emite "V-12345678" (la forma en
 * que se guarda) o lo escrito, también "V-123", mientras no es válida; vacío si
 * no hay número. Validar con `cedulaValida` / `validateCedula` de
 * `src/utils/validation.ts`.
 */
import React, { useEffect, useState, type Ref } from 'react';
import { StyleSheet, View, type ReturnKeyTypeOptions, type TextInput } from 'react-native';
import { Field, FieldMessage, Text, type FieldTone } from '@/src/components/ui';
import { PressableScale } from './PressableScale';
import { cedulaParaGuardar, separarCedula, type LetraCedula } from '@/src/utils/ve.generated';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

type LetraPermitida = 'V' | 'E' | 'J' | 'P';

const NOMBRE_LETRA: Record<LetraCedula, string> = {
  V: 'Venezolano',
  E: 'Extranjero',
  J: 'Jurídico',
  G: 'Gobierno',
  P: 'Pasaporte',
  C: 'Comunal',
};

const MAX_DIGITOS = 10;
/** Ancho en que caben "Ej. 12345678" y diez cifras sin recortar. */
const NUMERO_ANCHO_MINIMO = 140;

export interface CedulaFieldProps {
  label?: string;
  value: string;
  onChangeText(v: string): void;
  error?: string | null;
  helper?: string;
  /** Letras que se ofrecen. Por defecto `['V', 'E']`. */
  letras?: LetraPermitida[];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  editable?: boolean;
  /** Mismo `tone` que los demás campos de la tarjeta (AU-10). Por defecto `sunken`. */
  tone?: FieldTone;
  /** Al `TextInput` del número (para encadenar "Siguiente"). */
  ref?: Ref<TextInput>;
}

/** Lo que se emite: "V-12345678" si es válida; si no, "V-123"; '' sin número. */
function componer(letra: LetraCedula, numero: string): string {
  if (!numero) return '';
  return cedulaParaGuardar(`${letra}${numero}`) ?? `${letra}-${numero}`;
}

export function CedulaField({
  label = 'Cédula',
  value,
  onChangeText,
  error,
  helper,
  letras = ['V', 'E'],
  returnKeyType,
  onSubmitEditing,
  editable = true,
  tone = 'sunken',
  ref,
}: CedulaFieldProps) {
  const separada = separarCedula(value);
  const tieneLetra = /^[A-Z]/i.test((value ?? '').trim());

  // Sin valor se recuerda la última letra elegida (si no, al borrar el número
  // volvería a "V").
  const [letraElegida, setLetraElegida] = useState<LetraCedula>(
    tieneLetra ? separada.letra : letras[0] ?? 'V'
  );
  const letra: LetraCedula = tieneLetra ? separada.letra : letraElegida;

  useEffect(() => {
    if (tieneLetra && separada.letra !== letraElegida) setLetraElegida(separada.letra);
  }, [tieneLetra, separada.letra, letraElegida]);

  // Una letra guardada que no está en `letras` (p. ej. "J-…") se muestra igual.
  const opciones: LetraCedula[] = letras.includes(letra as LetraPermitida)
    ? letras
    : [...letras, letra];

  const emitir = (texto: string) => onChangeText(texto);

  const elegirLetra = (nueva: LetraCedula) => {
    if (!editable) return;
    setLetraElegida(nueva);
    emitir(componer(nueva, separada.numero));
  };

  const cambiarNumero = (texto: string) => {
    // ¿Pegó la cédula completa con letra ("v-12.345.678")?
    const conLetra = /^\s*[VEJGPC]\s*-?/i.test(texto);
    if (conLetra) {
      const pegada = separarCedula(texto);
      const letraPegada = pegada.letra;
      setLetraElegida(letraPegada);
      emitir(componer(letraPegada, pegada.numero));
      return;
    }
    const numero = texto.replace(/\D/g, '').slice(0, MAX_DIGITOS);
    emitir(componer(letra, numero));
  };

  const nombreGrupo = `${label}: tipo de documento`;

  return (
    <View style={s.wrapper}>
      <Text
        variant="label"
        style={s.label}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {label}
      </Text>

      <View style={s.row}>
        <View style={s.letras} accessibilityRole="radiogroup" accessibilityLabel={nombreGrupo}>
          {opciones.map((l) => (
            <PressableScale
              key={l}
              onPress={() => elegirLetra(l)}
              haptic
              hapticType="selection"
              scaleValue={Motion.press.chip}
              accessibilityRole="radio"
              accessibilityState={{ selected: l === letra }}
              accessibilityLabel={`${NOMBRE_LETRA[l]} (${l})`}
              style={[s.letra, tone === 'light' ? s.letraSobreCanvas : null, l === letra ? s.letraElegida : null]}
            >
              <Text
                variant="body"
                weight="semibold"
                color={l === letra ? 'inverse' : 'foreground'}
                compact
              >
                {l}
              </Text>
            </PressableScale>
          ))}
        </View>

        <Field
          ref={ref}
          value={separada.numero}
          onChangeText={cambiarNumero}
          placeholder="Ej. 12345678"
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          tone={tone}
          error={error ?? undefined}
          helper={helper}
          // La ayuda y el error van a todo el ancho, bajo la fila (AU-10).
          sinMensaje
          accessibilityLabel={`${label}, número (${NOMBRE_LETRA[letra]}, ${letra})`}
          containerStyle={s.numero}
        />
      </View>

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
  // Si no cabe el número junto a las letras (cuatro letras en 360 pt), el campo
  // baja a su propia línea en vez de recortar la cifra.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  letras: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  // Misma altura y esquinas que el campo de al lado: se leen como un solo control.
  letra: {
    width: Sizes.iconBox.md,
    height: Sizes.control.lg,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  letraSobreCanvas: {
    backgroundColor: Colors.background,
  },
  letraElegida: {
    backgroundColor: Colors.accentStrong,
    ...Shadows.sky,
  },
  numero: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: NUMERO_ANCHO_MINIMO,
    minWidth: NUMERO_ANCHO_MINIMO,
    marginBottom: 0,
  },
});
