/**
 * Monto — la única forma de pintar dinero en la app.
 *
 * Dos líneas: el monto que se paga (Bs, o USD si se paga en dólares) y la
 * referencia ("≈ USD 12,40 · BCV 02/10"). Las reglas viven en
 * `src/utils/dinero.ts` (`formatMoney`); este componente solo las pinta.
 *
 *   <Monto usd={viaje.precio} />                         // usa la tasa BCV vigente
 *   <Monto usd={pago.monto} bs={pago.monto_bs} tasa={tasaRefDe(pago.tasa_bcv, pago.tasa_bcv_fecha)} />
 *   <Monto usd={total} moneda="USD" size="lg" align="center" />   // Zelle
 *
 * `tasa`: si no se pasa (undefined) se usa la vigente de `useTasaBCV`; con
 * `null` se muestra sin tasa a propósito (p. ej. un pago guardado sin tasa).
 *
 * En `lg`, el símbolo va más pequeño que la cifra: la cifra es lo que se lee.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, type TextColorToken } from './Text';
import { formatMoney, type MonedaPago, type TasaRef } from '@/src/utils/dinero';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { Spacing, type FontSizeToken, type TextVariant } from '@/src/theme';

export type MontoSize = 'lg' | 'md' | 'sm';

export interface MontoProps {
  /** USD de referencia */
  usd?: number | null;
  /** Bs ya calculados (p. ej. `pagos.monto_bs`); si falta se calcula con la tasa */
  bs?: number | null;
  /** Tasa a usar. `undefined` = la vigente; `null` = sin tasa */
  tasa?: TasaRef | null;
  /** Moneda en la que se paga: 'USD' pone el USD como dato principal */
  moneda?: MonedaPago;
  size?: MontoSize;
  align?: 'left' | 'center' | 'right';
  /** Color del dato principal (por defecto `foreground`) */
  color?: TextColorToken;
  /** Oculta la línea de referencia */
  sinReferencia?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PRINCIPAL: Record<MontoSize, { variant: TextVariant; size?: FontSizeToken }> = {
  lg: { variant: 'display', size: '3xl' },
  md: { variant: 'subheading' },
  sm: { variant: 'bodyStrong' },
};

const SECUNDARIO: Record<MontoSize, { variant: TextVariant; size?: FontSizeToken }> = {
  lg: { variant: 'secondary' },
  md: { variant: 'caption' },
  // La referencia se lee también en las listas. `micro` es solo para contadores.
  sm: { variant: 'caption' },
};

const ALINEACION = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * "Bs 17.822,11" → el símbolo pequeño y la cifra grande, sobre la misma línea base.
 * Para los montos que mandan en una pantalla.
 */
export function CifraMonto({
  texto,
  color = 'foreground',
  size = '3xl',
  align,
}: {
  texto: string;
  color?: string;
  size?: FontSizeToken;
  align?: 'left' | 'center' | 'right';
}) {
  const espacio = texto.indexOf(' ');
  const simbolo = espacio > 0 ? texto.slice(0, espacio) : null;
  const cifra = espacio > 0 ? texto.slice(espacio + 1) : texto;
  return (
    <Text variant="display" size={size} color={color} align={align} numberOfLines={1} adjustsFontSizeToFit compact>
      {simbolo ? (
        <Text variant="heading" weight="medium" size="xl" tracking="normal" color={color}>
          {`${simbolo} `}
        </Text>
      ) : null}
      {cifra}
    </Text>
  );
}

export function Monto(props: MontoProps) {
  // El hook solo se usa cuando la pantalla no pasa una tasa.
  return props.tasa === undefined ? <MontoConTasaVigente {...props} /> : <MontoBase {...props} />;
}

function MontoConTasaVigente(props: MontoProps) {
  const { tasaRef } = useTasaBCV();
  return <MontoBase {...props} tasa={tasaRef} />;
}

function MontoBase({
  usd,
  bs,
  tasa,
  moneda,
  size = 'md',
  align = 'left',
  color = 'foreground',
  sinReferencia,
  style,
  testID,
}: MontoProps) {
  const { principal, secundario, accesible } = formatMoney({ usd, bs, tasa, moneda });
  const p = PRINCIPAL[size];
  const sec = SECUNDARIO[size];

  return (
    <View
      style={[styles.base, { alignItems: ALINEACION[align] }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accesible}
      testID={testID}
    >
      {size === 'lg' ? (
        <CifraMonto texto={principal} color={color} align={align} />
      ) : (
        <Text variant={p.variant} size={p.size} color={color} align={align} tracking="snug">
          {principal}
        </Text>
      )}
      {secundario && !sinReferencia ? (
        <Text variant={sec.variant} size={sec.size} color="muted" align={align} style={size === 'lg' ? styles.refLg : null}>
          {secundario}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // En una fila, un monto largo parte su línea en vez de salirse del contenedor.
  base: {
    flexShrink: 1,
  },
  refLg: {
    marginTop: Spacing.xs,
  },
});
