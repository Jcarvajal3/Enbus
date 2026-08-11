/**
 * EntityCard — the list row used across the whole app.
 *
 * Four near-identical implementations existed (TransactionCard, ResultsList
 * rows, the cooperativa picker in boletos/buscar and the one in
 * encomiendas/nueva). They shared the exact anatomy — badge row, title,
 * subtitle, and a tall letter pill on the right — but differed in radius,
 * padding, background and pill colour. This is that anatomy, once.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import {
  Colors,
  Motion,
  Radius,
  Sizes,
  Spacing,
  StatusPalette,
  type StatusTone,
} from '@/src/theme';

export type PillTone = StatusTone | 'accent' | 'primary';

const PILL_WIDTH = Sizes.iconBox.lg + Spacing.sm;
const PILL_HEIGHT = Sizes.iconBox['2xl'];

function pillColors(tone: PillTone, selected: boolean) {
  if (selected) return { bg: Colors.accent, fg: Colors.white };
  if (tone === 'accent') return { bg: Colors.accentLight, fg: Colors.accent };
  if (tone === 'primary') return { bg: Colors.primaryLight, fg: Colors.primary };
  const spec = StatusPalette[tone];
  return { bg: spec.bg, fg: spec.fg };
}

export interface EntityCardProps {
  title: string;
  subtitle?: string;
  /** Leading element of the top row — usually a `<StatusBadge />` or `<Badge />` */
  badge?: React.ReactNode;
  /** Trailing element of the top row — a code, a price, a seat count */
  meta?: React.ReactNode;
  /** Letter shown in the tall pill on the right */
  initial: string;
  tone?: PillTone;
  /** Selectable variant: draws an accent outline when picked */
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const EntityCard = memo(function EntityCard({
  title,
  subtitle,
  badge,
  meta,
  initial,
  tone = 'accent',
  selectable = false,
  selected = false,
  onPress,
  accessibilityLabel,
}: EntityCardProps) {
  const pill = pillColors(tone, selectable && selected);

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      accessibilityRole={selectable ? 'radio' : 'button'}
      accessibilityState={selectable ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? `${title}${subtitle ? `. ${subtitle}` : ''}`}
      style={[
        s.card,
        selectable ? s.selectable : null,
        selectable && selected ? s.selected : null,
      ]}
    >
      <View style={s.body}>
        {(badge || meta) && (
          <View style={s.topRow}>
            {badge ?? <View />}
            {typeof meta === 'string' ? (
              <Text variant="caption" color="muted" weight="bold" uppercase compact numberOfLines={1}>
                {meta}
              </Text>
            ) : (
              meta
            )}
          </View>
        )}

        <Text variant="subheading" numberOfLines={2} style={s.title}>
          {title}
        </Text>

        {subtitle ? (
          <Text variant="secondary" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[s.pill, { backgroundColor: pill.bg }]}>
        <Text variant="heading" size="2xl" weight="bold" color={pill.fg} compact>
          {initial}
        </Text>
      </View>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  selectable: {
    backgroundColor: Colors.white,
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.transparent,
  },
  selected: {
    borderColor: Colors.accent,
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  title: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.lg,
  },
});
