/**
 * ScreenHeader — one header for every screen.
 *
 * The app had four unrelated header treatments (big title, back+title with a
 * bottom rule, back+eyebrow+code, and a stepper). They now share this
 * component, so title size, back-button hit area, gutter and the presence of a
 * divider are decided once.
 *
 *   <ScreenHeader title="Mis Viajes" subtitle="Gestiona y consulta tus pasajes" />
 *   <ScreenHeader variant="compact" title="Mi Perfil" onBack={router.back} right={…} />
 *   <ScreenHeader variant="steps" title="Confirmar Pago" step={2} totalSteps={3} onBack={…} />
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

export type ScreenHeaderVariant = 'large' | 'compact' | 'steps';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Small uppercase line above the title */
  eyebrow?: string;
  variant?: ScreenHeaderVariant;
  onBack?: () => void;
  backLabel?: string;
  /** Trailing actions */
  right?: React.ReactNode;
  /** `steps` variant only */
  step?: number;
  totalSteps?: number;
  /** Hairline under the header — on by default for `compact` */
  divided?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  variant = 'large',
  onBack,
  backLabel = 'Volver',
  right,
  step = 1,
  totalSteps = 1,
  divided,
}: ScreenHeaderProps) {
  const showDivider = divided ?? variant === 'compact';

  if (variant === 'steps') {
    return (
      <View style={[s.container, showDivider && s.divided]}>
        <View style={s.row}>
          {onBack ? (
            <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} />
          ) : (
            <View style={s.backSpacer} />
          )}
          <StepIndicator step={step} totalSteps={totalSteps} />
        </View>
        <Text variant="heading" align="center" style={s.stepTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="secondary" color="muted" align="center" style={s.stepSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  if (variant === 'compact') {
    return (
      <View style={[s.container, s.compactContainer, showDivider && s.divided]}>
        <View style={s.compactLeft}>
          {onBack && <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} />}
          <View style={s.compactTitles}>
            {eyebrow ? (
              <Text variant="overline" color="muted" uppercase compact>
                {eyebrow}
              </Text>
            ) : null}
            <Text variant="heading" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" color="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {right ? <View style={s.rightGroup}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View style={[s.container, showDivider && s.divided]}>
      <View style={s.largeRow}>
        <View style={s.largeTitles}>
          {eyebrow ? (
            <Text variant="overline" color="muted" uppercase>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="title">{title}</Text>
          {subtitle ? (
            <Text variant="secondary" color="muted" style={s.largeSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={s.rightGroup}>{right}</View> : null}
      </View>
    </View>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────

/**
 * Progress dots for multi-step flows. The active dot stretches into a pill and
 * the transition is animated — previously the dots snapped between states.
 */
export function StepIndicator({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <View style={s.stepper} accessibilityRole="progressbar" accessibilityValue={{ now: step, min: 1, max: totalSteps }}>
      <View style={s.stepDots}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <StepDot key={i} active={i + 1 === step} done={i + 1 < step} />
        ))}
      </View>
      <Text variant="label" weight="bold" compact>
        {`${String(step).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`}
      </Text>
    </View>
  );
}

const DOT_SIZE = Spacing.sm - 2;
const PILL_WIDTH = Spacing['4xl'];

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const width = useSharedValue(active ? PILL_WIDTH : DOT_SIZE);

  React.useEffect(() => {
    width.value = withTiming(active ? PILL_WIDTH : DOT_SIZE, {
      duration: Motion.duration.base,
      easing: Motion.easing.out,
    });
  }, [active, width]);

  const animated = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[
        s.stepDot,
        animated,
        { backgroundColor: active || done ? Colors.foreground : Colors.border },
      ]}
    />
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Layout.headerPaddingTop,
    paddingBottom: Layout.headerPaddingBottom,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  divided: {
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backSpacer: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  // large
  largeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  largeTitles: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  largeSubtitle: {
    marginTop: Spacing.xs / 2,
  },

  // compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  compactLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  compactTitles: {
    flex: 1,
  },

  // steps
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepDot: {
    height: DOT_SIZE - 1,
    borderRadius: Radius.full,
  },
  stepTitle: {
    marginTop: Spacing.lg,
  },
  stepSubtitle: {
    marginTop: Spacing.xs,
  },
});
