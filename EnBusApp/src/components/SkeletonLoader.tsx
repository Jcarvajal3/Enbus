/**
 * SkeletonLoader / ScreenSkeleton — la espera con la forma de lo que viene
 * (AU-49). Una pantalla que carga muestra su esqueleto; el spinner va solo
 * dentro de los botones.
 *
 *   if (cargando) return <ScreenSkeleton variante="detalle" />;
 *
 * Solo se anima la opacidad; con "reducir movimiento" los bloques quedan fijos.
 */
import React, { useEffect } from 'react';
import { DimensionValue, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  /** Offsets the pulse so stacked skeletons don't breathe in unison. */
  index?: number;
}

/** Desfase del pulso entre bloques apilados (cuatro fases). */
const FASES = 4;

/**
 * Pulsing placeholder block. Opacity only — no layout work while loading.
 * Con "reducir movimiento" el bloque queda fijo, sin pulso.
 */
export function SkeletonLoader({
  width = '100%',
  height = Sizes.icon.sm,
  borderRadius = Radius.xs,
  index = 0,
}: SkeletonLoaderProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 0.5 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5;
      return;
    }
    // Deterministic offset per index (a random delay made re-renders jitter).
    const offset = (index % FASES) * Motion.duration.instant;
    const timer = setTimeout(() => {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: Motion.duration.ambient, easing: Motion.easing.inOut }),
          withTiming(0, { duration: Motion.duration.ambient, easing: Motion.easing.inOut })
        ),
        -1,
        false
      );
    }, offset);

    return () => clearTimeout(timer);
  }, [index, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.45,
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: Colors.surfaceDark }, animatedStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

// ─── Esqueletos de pantalla ──────────────────────────────────────────────────

/** Fila con la forma de `EntityCard`: insignia + código, título, subtítulo, flecha. */
function FilaEsqueleto({ index }: { index: number }) {
  return (
    <View style={s.fila}>
      <View style={s.filaCuerpo}>
        <View style={s.filaArriba}>
          <SkeletonLoader width={Sizes.iconBox['2xl']} height={Sizes.badge.sm} borderRadius={Radius.full} index={index} />
          <SkeletonLoader width={Sizes.iconBox['2xl']} height={Sizes.icon.xs} index={index} />
        </View>
        <SkeletonLoader width="70%" height={Sizes.icon.md} index={index} />
        <SkeletonLoader width="45%" height={Sizes.icon.xs} index={index} />
      </View>
    </View>
  );
}

/**
 * Esqueleto de una pantalla entera, bajo su cabecera:
 * - `lista`: control segmentado + filas (Mis boletos, Mis encomiendas, notificaciones).
 * - `detalle`: bloque principal + dos tarjetas de datos (boleto, encomienda, viaje).
 * - `perfil`: avatar y nombre + tarjetas de filas (perfil, ayuda, cuenta).
 */
export function ScreenSkeleton({ variante }: { variante: 'lista' | 'detalle' | 'perfil' }) {
  return (
    <View
      style={s.pantalla}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando"
    >
      {variante === 'lista' ? (
        <>
          <SkeletonLoader height={Sizes.control.sm + Spacing.sm} borderRadius={Radius.full} />
          <View style={s.lista}>
            {Array.from({ length: 4 }, (_, i) => (
              <FilaEsqueleto key={i} index={i} />
            ))}
          </View>
        </>
      ) : variante === 'detalle' ? (
        <>
          <SkeletonLoader height={Sizes.iconBox['2xl'] * 2} borderRadius={Radius.xl} />
          <View style={s.tarjeta}>
            <SkeletonLoader width="40%" height={Sizes.icon.xs} index={1} />
            <SkeletonLoader width="80%" height={Sizes.icon.md} index={1} />
            <SkeletonLoader width="60%" height={Sizes.icon.md} index={1} />
          </View>
          <View style={s.tarjeta}>
            <SkeletonLoader width="35%" height={Sizes.icon.xs} index={2} />
            <SkeletonLoader width="75%" height={Sizes.icon.md} index={2} />
          </View>
        </>
      ) : (
        <>
          <View style={s.perfilCabecera}>
            <SkeletonLoader width={Sizes.avatar.md} height={Sizes.avatar.md} borderRadius={Radius.full} />
            <View style={s.perfilNombre}>
              <SkeletonLoader width="60%" height={Sizes.icon.lg} />
              <SkeletonLoader width="40%" height={Sizes.icon.xs} />
            </View>
          </View>
          {[0, 1].map((t) => (
            <View key={t} style={s.tarjeta}>
              {Array.from({ length: 3 }, (_, i) => (
                <View key={i} style={s.perfilFila}>
                  <SkeletonLoader width={Sizes.iconBox.md} height={Sizes.iconBox.md} borderRadius={Radius.full} index={t + i} />
                  <SkeletonLoader width="55%" height={Sizes.icon.sm} index={t + i} />
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    gap: Spacing['2xl'],
  },
  lista: {
    gap: Spacing.md,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  filaCuerpo: {
    flex: 1,
    gap: Spacing.sm,
  },
  filaArriba: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tarjeta: {
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  perfilCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  perfilNombre: {
    flex: 1,
    gap: Spacing.sm,
  },
  perfilFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
