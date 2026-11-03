/**
 * SegmentedControl — the sliding pill toggle.
 *
 * This exact control (track, absolutely-positioned indicator, onLayout width
 * maths, withTiming translate) was reimplemented four times: boletos, paquetes,
 * SearchForm and the login screen — the last one without animation at all, so
 * the same interaction felt different depending on where you were. One
 * implementation now serves all of them.
 *
 * D19: pastilla `background` sobre pista `surface`; activo `foreground`
 * semibold, inactivo `mutedForeground`. No usa azul (es superficie, no
 * selección de un dato). Con "reducir movimiento" la pastilla salta sin
 * deslizarse.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { CountPill } from './Badge';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<IconProps>;
  /** Optional counter rendered after the label */
  badge?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `sunken` sits on a white screen, `raised` sits inside a beige card */
  tone?: 'sunken' | 'raised';
  style?: ViewStyle;
}

const TRACK_PADDING = Spacing.xs;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = 'sunken',
  style,
}: SegmentedControlProps<T>) {
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  const onLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const width = event.nativeEvent.layout.width;
      setTrackWidth(width);
      const segment = (width - TRACK_PADDING * 2) / options.length;
      // First measurement snaps into place; subsequent changes animate.
      indicatorWidth.value = segment;
      translateX.value = activeIndex * segment;
    },
    [options.length, activeIndex, indicatorWidth, translateX]
  );

  useEffect(() => {
    if (segmentWidth <= 0) return;
    indicatorWidth.value = segmentWidth;
    const destino = activeIndex * segmentWidth;
    translateX.value = reduceMotion
      ? destino
      : withTiming(destino, { duration: Motion.duration.base, easing: Motion.easing.out });
  }, [activeIndex, segmentWidth, indicatorWidth, translateX, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[s.track, tone === 'raised' ? s.trackRaised : s.trackSunken, style]}
      onLayout={onLayout}
      accessibilityRole="tablist"
    >
      {trackWidth > 0 && <Animated.View style={[s.indicator, indicatorStyle]} />}

      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;

        return (
          <PressableScale
            key={option.value}
            onPress={() => onChange(option.value)}
            haptic
            hapticType="selection"
            scaleValue={Motion.press.chip}
            style={s.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
          >
            {Icon && (
              <Icon
                size={Sizes.icon.sm}
                color={isActive ? Colors.foreground : Colors.mutedForeground}
                weight="bold"
              />
            )}
            <Text variant="label" color={isActive ? 'foreground' : 'muted'} compact numberOfLines={1}>
              {option.label}
            </Text>
            {option.badge ? <CountPill value={option.badge} active={isActive} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: TRACK_PADDING,
  },
  trackSunken: {
    backgroundColor: Colors.surface,
  },
  trackRaised: {
    backgroundColor: Colors.surfaceDark,
  },
  indicator: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    ...Shadows.subtle,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: Sizes.control.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    zIndex: 1,
  },
});
