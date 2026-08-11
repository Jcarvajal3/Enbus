import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SkeletonLoader } from './SkeletonLoader';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

interface CardSkeletonProps {
  /** Number of placeholder rows to render. */
  count?: number;
}

/**
 * Loading placeholder shaped like an `EntityCard`, so the list doesn't reflow
 * when real data arrives.
 */
export const CardSkeleton = memo(function CardSkeleton({ count = 3 }: CardSkeletonProps) {
  return (
    <View style={s.list} accessibilityLabel="Cargando contenido">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.card}>
          <View style={s.body}>
            <SkeletonLoader width={92} height={18} borderRadius={Radius.full} />
            <SkeletonLoader width="70%" height={16} />
            <SkeletonLoader width="45%" height={12} />
          </View>
          <SkeletonLoader
            width={Sizes.iconBox.lg + Spacing.sm}
            height={Sizes.iconBox['2xl']}
            borderRadius={Radius.md}
          />
        </View>
      ))}
    </View>
  );
});

const s = StyleSheet.create({
  list: {
    gap: Spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  body: {
    flex: 1,
    gap: Spacing.sm,
  },
});
