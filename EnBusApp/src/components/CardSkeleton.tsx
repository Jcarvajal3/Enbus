import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SkeletonLoader } from './SkeletonLoader';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

interface CardSkeletonProps {
  /** Number of placeholder rows to render. */
  count?: number;
}

/**
 * Loading placeholder shaped like an `EntityCard` (insignia + código, título,
 * subtítulo), so the list doesn't reflow when real data arrives.
 */
export const CardSkeleton = memo(function CardSkeleton({ count = 3 }: CardSkeletonProps) {
  return (
    <View style={s.list} accessible accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.card}>
          <View style={s.top}>
            <SkeletonLoader width={Sizes.iconBox['2xl']} height={Sizes.badge.sm} borderRadius={Radius.full} index={i} />
            <SkeletonLoader width={Sizes.iconBox['2xl']} height={Sizes.icon.xs} index={i} />
          </View>
          <SkeletonLoader width="70%" height={Sizes.icon.md} index={i} />
          <SkeletonLoader width="45%" height={Sizes.icon.xs} index={i} />
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
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
