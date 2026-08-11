/**
 * Card / Surface primitives.
 *
 * The app previously mixed `bg-white + Radius.xl + padding 20`,
 * `bg-surface + Radius.lg + padding 24` and `bg-card + Radius.md + padding 16`
 * for containers playing the same role. Two tones and three sizes cover every
 * case; the tone carries the meaning (raised = white on beige,
 * sunken = beige on white).
 */
import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Colors, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export type CardTone = 'raised' | 'sunken' | 'outline' | 'flat';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends ViewProps {
  tone?: CardTone;
  padding?: CardPadding;
  /** Elevation. `raised` cards default to a subtle shadow. */
  elevated?: boolean;
  radius?: keyof typeof Radius;
  children?: React.ReactNode;
}

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: Spacing.lg,
  md: Spacing.xl,
  lg: Spacing['2xl'],
};

const TONES: Record<CardTone, ViewStyle> = {
  raised: { backgroundColor: Colors.card },
  sunken: { backgroundColor: Colors.surface },
  outline: {
    backgroundColor: Colors.card,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
  flat: { backgroundColor: Colors.transparent },
};

export function Card({
  tone = 'raised',
  padding = 'md',
  elevated,
  radius = 'xl',
  style,
  children,
  ...rest
}: CardProps) {
  const shouldElevate = elevated ?? tone === 'raised';

  return (
    <View
      {...rest}
      style={[
        TONES[tone],
        { padding: PADDING[padding], borderRadius: Radius[radius] },
        shouldElevate ? Shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────

/** Uppercase eyebrow that introduces a group of fields inside a card. */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.sectionLabel, style]}>
      <Text variant="overline" color="muted" uppercase>
        {children}
      </Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ spacing = Spacing.lg }: { spacing?: number }) {
  return <View style={[s.divider, { marginVertical: spacing }]} />;
}

// ─── Info row ────────────────────────────────────────────────────────────────

/**
 * Label-over-value row used in every detail screen (perfil, boleto, encomienda).
 * Optional leading icon, optional top border for stacked groups.
 */
export function InfoRow({
  label,
  value,
  icon,
  divided,
  align = 'left',
  valueColor,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  divided?: boolean;
  align?: 'left' | 'right';
  valueColor?: string;
}) {
  return (
    <View style={[s.infoRow, divided && s.infoRowDivided]}>
      {icon}
      <View style={[s.infoRowBody, align === 'right' && s.infoRowBodyEnd]}>
        <Text variant="overline" color="muted" uppercase align={align === 'right' ? 'right' : 'left'}>
          {label}
        </Text>
        <Text variant="bodyStrong" color={valueColor} align={align === 'right' ? 'right' : 'left'}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    marginBottom: Spacing.md,
  },
  divider: {
    height: Sizes.hairline,
    backgroundColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  infoRowDivided: {
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.borderLight,
  },
  infoRowBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  infoRowBodyEnd: {
    alignItems: 'flex-end',
  },
});
