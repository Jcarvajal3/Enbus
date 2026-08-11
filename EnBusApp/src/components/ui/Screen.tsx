/**
 * Screen shell primitives: Screen, FloatingBar, EmptyState, LoadingState.
 *
 * These encode the layout rules that screens kept re-deriving by hand:
 * the horizontal gutter, and — critically — the bottom inset needed to clear
 * the floating tab bar. Lists used to hardcode `paddingBottom: 128` and FABs
 * `bottom: 110`; both now come from `Layout`, so moving the tab bar moves
 * everything with it.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { IconProps } from 'phosphor-react-native';
import { Button, type ButtonProps } from './Button';
import { Text } from './Text';
import { Colors, Gradients, Layout, Radius, Sizes, Spacing } from '@/src/theme';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function Screen({
  children,
  background = Colors.background,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  background?: string;
  edges?: readonly Edge[];
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView edges={edges} style={[s.screen, { backgroundColor: background }, style]}>
      {children}
    </SafeAreaView>
  );
}

/** Standard horizontal gutter for content that isn't inside a scroll view. */
export function Gutter({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.gutter, style]}>{children}</View>;
}

/**
 * Content padding for scrollables.
 *
 * `tabbed` reserves room for the floating tab bar; `floatingAction` reserves
 * room for a `<FloatingBar>` on top of it. Screens used to hardcode
 * `paddingBottom: 128` regardless of whether a FAB was present, so the last
 * card sat underneath it.
 */
export function scrollContent({
  tabbed = false,
  floatingAction = false,
  horizontal = true,
  top = Spacing.lg,
}: {
  tabbed?: boolean;
  floatingAction?: boolean;
  horizontal?: boolean;
  top?: number;
} = {}): ViewStyle {
  const base = tabbed ? Layout.scrollBottomInset : Layout.scrollBottomInsetPlain;
  const withAction = tabbed
    ? Layout.floatingBarBottom + Sizes.control.lg + Spacing.lg
    : Sizes.control.lg + Spacing['4xl'];

  return {
    paddingHorizontal: horizontal ? Layout.screenPadding : 0,
    paddingTop: top,
    paddingBottom: floatingAction ? withAction : base,
  };
}

// ─── Floating action bar ─────────────────────────────────────────────────────

/**
 * Pinned bottom action area. On tabbed screens it floats above the tab bar; on
 * stacked screens it sits on the bottom edge with a fade so content scrolling
 * underneath doesn't collide with the button.
 */
export function FloatingBar({
  children,
  tabbed = false,
  fade = true,
}: {
  children: React.ReactNode;
  tabbed?: boolean;
  fade?: boolean;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={[s.floatingBar, { bottom: tabbed ? Layout.floatingBarBottom : 0 }]}
    >
      {fade && !tabbed && (
        <LinearGradient
          colors={[...Gradients.fadeToBackground]}
          style={s.floatingFade}
          pointerEvents="none"
        />
      )}
      <View style={[s.floatingInner, !tabbed && s.floatingInnerPlain]}>{children}</View>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

/**
 * Every "nothing here yet" block. Previously five copies with icon circles of
 * 64 or 96pt and titles between 16 and 20pt.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: React.ComponentType<IconProps>;
  title: string;
  description?: string;
  /** Optional recovery action — an empty state should offer a way forward */
  action?: Pick<ButtonProps, 'children' | 'onPress' | 'variant' | 'icon'>;
  compact?: boolean;
}) {
  return (
    <View style={[s.empty, compact && s.emptyCompact]}>
      <View style={[s.emptyIcon, compact && s.emptyIconCompact]}>
        <Icon
          size={compact ? Sizes.icon.xl : Sizes.icon['2xl']}
          color={Colors.mutedForeground}
          weight="regular"
        />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="secondary" color="muted" align="center" style={s.emptyDescription}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={s.emptyAction}>
          <Button size="md" variant={action.variant ?? 'secondary'} {...action} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Loading state ───────────────────────────────────────────────────────────

/**
 * Centred loading block. Screens used to alternate between `<Spinner />`,
 * `<ActivityIndicator color={primary}>` and `<ActivityIndicator color={accent}>`
 * for the same wait; this is the one spelling.
 */
export function LoadingState({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <View style={[s.loading, compact && s.loadingCompact]} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={Colors.accent} />
      {label ? (
        <Text variant="secondary" color="muted" align="center" style={s.loadingLabel}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loading: {
    paddingVertical: Spacing['5xl'] + Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCompact: {
    paddingVertical: Spacing['3xl'],
  },
  loadingLabel: {
    marginTop: Spacing.md,
  },
  gutter: {
    paddingHorizontal: Layout.screenPadding,
  },
  floatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  floatingFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Spacing['5xl'] * 2,
  },
  floatingInner: {
    paddingHorizontal: Layout.screenPadding,
  },
  floatingInnerPlain: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'] + Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyCompact: {
    paddingVertical: Spacing['4xl'],
  },
  emptyIcon: {
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  emptyIconCompact: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    marginBottom: Spacing.lg,
  },
  emptyDescription: {
    marginTop: Spacing.sm,
    maxWidth: 300,
  },
  emptyAction: {
    marginTop: Spacing.xl,
  },
});
