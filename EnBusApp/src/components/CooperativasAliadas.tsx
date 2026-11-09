/**
 * CooperativasAliadas — la fila "Cooperativas aliadas" de Inicio: las mejor
 * valoradas, con su logo, en un carrusel horizontal, y "Ver todas" al buscador.
 *
 *   <CooperativasAliadas onVerTodas={…} onAbrir={(id) => …} />
 *
 * Es un atajo: mientras carga muestra la forma de la fila; si falla o aún no hay
 * cooperativas, no se dibuja (Inicio no se llena de errores por algo secundario).
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LogoCooperativa } from './LogoCooperativa';
import { CalificacionCooperativa, textoCalificacion } from './CalificacionCooperativa';
import { PressableScale } from './PressableScale';
import { SkeletonLoader } from './SkeletonLoader';
import { Text, TextLink } from '@/src/components/ui';
import { ordenPorCalificacion, useCooperativasAliadas } from '@/src/hooks/useCooperativas';
import type { CooperativaAliada } from '@/src/types';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing, Typography } from '@/src/theme';

/** Cuántas caben en la fila antes de "Ver todas". */
const EN_LA_FILA = 10;
/** Ancho de cada tarjeta: el logo grande con su aire. */
const ANCHO_TARJETA = Sizes.avatar.lg + Spacing.xl;

export function CooperativasAliadas({
  onVerTodas,
  onAbrir,
  style,
}: {
  onVerTodas(): void;
  onAbrir(id: string): void;
  style?: React.ComponentProps<typeof View>['style'];
}) {
  const { data, loading } = useCooperativasAliadas();
  const lista = (data ?? []).slice().sort(ordenPorCalificacion).slice(0, EN_LA_FILA);

  if (!loading && lista.length === 0) return null;

  return (
    <View style={style}>
      <View style={s.cabecera}>
        <Text variant="overline" accessibilityRole="header" style={s.titulo}>
          Cooperativas aliadas
        </Text>
        <TextLink onPress={onVerTodas} accessibilityLabel="Ver todas las cooperativas aliadas">
          Ver todas
        </TextLink>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.carrusel}
        contentContainerStyle={s.fila}
      >
        {loading && lista.length === 0
          ? Array.from({ length: 4 }, (_, i) => <TarjetaEsqueleto key={i} index={i} />)
          : lista.map((coop) => <TarjetaCooperativa key={coop.id} coop={coop} onPress={() => onAbrir(coop.id)} />)}
      </ScrollView>
    </View>
  );
}

function TarjetaCooperativa({ coop, onPress }: { coop: CooperativaAliada; onPress(): void }) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.tarjeta}
      accessibilityRole="button"
      accessibilityLabel={`${coop.nombre}. Calificación ${textoCalificacion(
        coop.calificacion_promedio,
        coop.total_calificaciones
      )}`}
      accessibilityHint="Abre sus rutas y sucursales"
    >
      <LogoCooperativa nombre={coop.nombre} logoUrl={coop.logo_url} size="lg" decorativo />
      <Text variant="label" align="center" numberOfLines={2} style={s.nombre}>
        {coop.nombre}
      </Text>
      <CalificacionCooperativa valor={coop.calificacion_promedio} />
    </PressableScale>
  );
}

function TarjetaEsqueleto({ index }: { index: number }) {
  return (
    <View style={s.tarjeta} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonLoader width={Sizes.tile.lg} height={Sizes.tile.lg} borderRadius={Radius.md} index={index} />
      <SkeletonLoader width="80%" height={Sizes.icon.xs} index={index} />
      <SkeletonLoader width="45%" height={Sizes.icon.xs} index={index} />
    </View>
  );
}

const s = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  titulo: {
    flexShrink: 1,
  },
  // La fila llega hasta los bordes de la pantalla: se ve que sigue.
  carrusel: {
    marginHorizontal: -Layout.screenPadding,
  },
  fila: {
    gap: Spacing.md,
    paddingHorizontal: Layout.screenPadding,
    // Aire para la sombra de las tarjetas.
    paddingVertical: Spacing.sm,
  },
  tarjeta: {
    width: ANCHO_TARJETA,
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    ...Shadows.card,
  },
  nombre: {
    // Dos líneas siempre: las estrellas quedan alineadas en toda la fila.
    minHeight: Typography.lineHeights.sm * 2,
  },
});
