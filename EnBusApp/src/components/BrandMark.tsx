/**
 * BrandMark — la marca de EnBus.
 *
 * Bloque cuadrado con el sol (gradiente amarillo) y "EB" en tinta, radio = 30 % del
 * lado y letra = 42 % del lado: la misma geometría que el icono de la app
 * (`shared/marca/eb.svg`), el panel y la landing. Con `conNombre`, "EnBus" a la
 * derecha y, si se pasa, una subzona debajo.
 *
 *   <BrandMark size={56} />                 // arranque
 *   <BrandMark conNombre />                 // cabecera de Inicio (40)
 *   <BrandMark size={56} conNombre />       // login
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/src/components/ui';
import { Gradients, Shadows, Spacing, type FontSizeToken } from '@/src/theme';

type TamanoMarca = 32 | 40 | 56;

/** Geometría, en fracción del lado del bloque. */
const RADIO_RELATIVO = 0.3;
const LETRA_RELATIVA = 0.42;

/** Tamaño del nombre "EnBus" junto a cada bloque. */
const NOMBRE: Record<TamanoMarca, FontSizeToken> = {
  32: 'lg',
  40: 'xl',
  56: '2xl',
};

export function BrandMark({
  size = 40,
  conNombre = false,
  subtitulo,
}: {
  size?: TamanoMarca;
  conNombre?: boolean;
  subtitulo?: string;
}) {
  const bloque = (
    <View
      style={[
        s.bloque,
        { width: size, height: size, borderRadius: Math.round(size * RADIO_RELATIVO) },
      ]}
      accessible={!conNombre}
      accessibilityRole={conNombre ? undefined : 'image'}
      accessibilityLabel={conNombre ? undefined : 'EnBus'}
    >
      <LinearGradient
        colors={[...Gradients.sun]}
        style={[StyleSheet.absoluteFill, { borderRadius: Math.round(size * RADIO_RELATIVO) }]}
      />
      <Text
        variant="title"
        weight="heavy"
        color="foreground"
        tracking="tight"
        compact
        allowFontScaling={false}
        style={{ fontSize: Math.round(size * LETRA_RELATIVA) }}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        EB
      </Text>
    </View>
  );

  if (!conNombre) return bloque;

  return (
    <View
      style={s.fila}
      accessible
      accessibilityRole="header"
      accessibilityLabel={subtitulo ? `EnBus, ${subtitulo}` : 'EnBus'}
    >
      {bloque}
      <View>
        <Text variant="heading" size={NOMBRE[size]} weight="bold" tracking="tight" compact>
          EnBus
        </Text>
        {subtitulo ? (
          <Text variant="caption" color="muted" weight="medium" compact style={s.subtitulo}>
            {subtitulo}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloque: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    ...Shadows.sun,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  subtitulo: {
    marginTop: Spacing.xs,
  },
});
