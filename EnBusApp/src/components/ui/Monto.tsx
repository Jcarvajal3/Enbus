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
  sm: { variant: 'caption', size: 'micro' },
};

const ALINEACION = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

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
  const s = SECUNDARIO[size];

  return (
    <View
      style={[styles.base, { alignItems: ALINEACION[align] }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accesible}
      testID={testID}
    >
      <Text variant={p.variant} size={p.size} color={color} align={align} compact={size === 'lg'}>
        {principal}
      </Text>
      {secundario && !sinReferencia ? (
        <Text variant={s.variant} size={s.size} color="muted" align={align}>
          {secundario}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    gap: Spacing.xs / 2,
  },
});
