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
import React, { useEffect, useRef, useState, type Ref } from 'react';
import {
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type ReturnKeyTypeOptions,
  type TextInput,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Field, FieldMessage, Text, type FieldTone } from '@/src/components/ui';
import { PressableScale } from './PressableScale';
import {
  CEDULA_PLACEHOLDER,
  LETRAS_PERSONA,
  cedulaParaGuardar,
  editarCedulaNumero,
  mascaraCedulaNumero,
  separarCedula,
  type LetraCedula,
} from '@/src/utils/ve.generated';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

const NOMBRE_LETRA: Record<LetraCedula, string> = {
  V: 'Venezolano',
  E: 'Extranjero',
  J: 'Jurídico',
  G: 'Gobierno',
  P: 'Pasaporte',
  C: 'Comunal',
};

/** Ancho en que caben "Ej. 12.345.678" y diez cifras con puntos sin recortar. */
const NUMERO_ANCHO_MINIMO = 160;

export interface CedulaFieldProps {
  label?: string;
  value: string;
  onChangeText(v: string): void;
  error?: string | null;
  helper?: string;
  /**
   * Letras que se ofrecen según el contexto: `LETRAS_PERSONA` (por defecto),
   * `LETRAS_PASAJERO`, `LETRAS_ENCOMIENDA` o `LETRAS_TITULAR` de `ve.generated`.
   */
  letras?: readonly LetraCedula[];
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
  letras = LETRAS_PERSONA,
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
  const opciones: readonly LetraCedula[] = letras.includes(letra) ? letras : [...letras, letra];

  const emitir = (texto: string) => onChangeText(texto);

  // El número se ve con puntos de miles ("12.345.678"); se guarda sin ellos.
  const visible = mascaraCedulaNumero(separada.numero);

  // Cursor: la máscara cambia el texto y en el móvil el cursor saltaría al final al
  // escribir a medio número. Se recuerda la selección y, solo si no se escribe al
  // final, se recoloca tras el mismo dígito.
  const seleccionRef = useRef({ start: 0, end: 0 });
  const [seleccion, setSeleccion] = useState<{ start: number; end: number } | undefined>(undefined);

  const alCambiarSeleccion = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    seleccionRef.current = e.nativeEvent.selection;
    if (seleccion && e.nativeEvent.selection.start === seleccion.start && e.nativeEvent.selection.end === seleccion.end) {
      setSeleccion(undefined);
    }
  };

  // Salvaguarda: si el sistema no avisa del cambio de selección, se suelta el control.
  useEffect(() => {
    if (!seleccion) return;
    const t = setTimeout(() => setSeleccion(undefined), 120);
    return () => clearTimeout(t);
  }, [seleccion]);

  const colocarCursor = (escrito: string, resultado: string) => {
    const previa = seleccionRef.current;
    if (previa.start !== previa.end || previa.end >= visible.length) {
      setSeleccion(undefined);
      return;
    }
    const cuenta = (t: string) => t.replace(/\D/g, '').length;
    const cursorEscrito = Math.max(0, Math.min(escrito.length, previa.start + escrito.length - visible.length));
    let digitosAntes = cuenta(escrito.slice(0, cursorEscrito));
    // Se borró un punto: la máscara quitó el dígito anterior.
    if (escrito.length === visible.length - 1 && cuenta(escrito) === cuenta(visible)) digitosAntes -= 1;
    digitosAntes = Math.max(0, Math.min(digitosAntes, cuenta(resultado)));
    let pos = 0;
    let vistos = 0;
    while (pos < resultado.length && vistos < digitosAntes) {
      if (/\d/.test(resultado.charAt(pos))) vistos++;
      pos++;
    }
    setSeleccion({ start: pos, end: pos });
  };

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
    const resultado = editarCedulaNumero(visible, texto);
    colocarCursor(texto, resultado);
    emitir(componer(letra, resultado.replace(/\D/g, '')));
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
          value={visible}
          selection={seleccion}
          onSelectionChange={alCambiarSeleccion}
          onChangeText={cambiarNumero}
          placeholder={CEDULA_PLACEHOLDER}
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
