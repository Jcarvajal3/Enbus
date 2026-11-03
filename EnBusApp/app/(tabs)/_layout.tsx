import { Tabs } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Package, Ticket, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/src/components/PressableScale';
import { Text } from '@/src/components/ui';
import { ActivityProvider, useActivity } from '@/src/contexts/ActivityContext';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

const TAB_ICONS: Record<string, React.ComponentType<IconProps>> = {
  index: House,
  encomiendas: Package,
  boletos: Ticket,
};

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: string; target: string; canPreventDefault: boolean }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
  badges: Record<string, number>;
}

function CustomTabBar({ state, descriptors, navigation, badges }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);

  const tabCount = state.routes.length;
  const tabWidth =
    barWidth > 0 ? (barWidth - Layout.tabBar.innerPadding * 2) / tabCount : 0;

  const translateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    if (tabWidth <= 0) return;
    indicatorWidth.value = tabWidth;
    translateX.value = withTiming(state.index * tabWidth, {
      duration: Motion.duration.base,
      easing: Motion.easing.out,
    });
  }, [state.index, tabWidth, indicatorWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      // The bar floats, so it must clear the device's own bottom inset —
      // previously it sat at a fixed 24pt and collided with the gesture bar.
      style={[s.bar, { bottom: Layout.tabBar.bottomOffset + insets.bottom }]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {barWidth > 0 && <Animated.View style={[s.indicator, indicatorStyle]} />}

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isFocused = state.index === index;
        const Icon = TAB_ICONS[route.name] ?? House;
        const badgeCount = badges[route.name] ?? 0;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            Haptics.selectionAsync();
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <PressableScale
            key={route.key}
            onPress={onPress}
            scaleValue={Motion.press.chip}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={
              badgeCount > 0
                ? `${label}, ${badgeCount} ${route.name === 'encomiendas' ? 'activas' : 'activos'}`
                : label
            }
          >
            <View style={s.iconWrapper}>
              <Icon
                size={Sizes.icon.lg}
                color={isFocused ? Colors.white : Colors.tabInactive}
                weight={isFocused ? 'fill' : 'regular'}
              />
              {badgeCount > 0 && (
                <View style={s.badge}>
                  <Text variant="caption" size="micro" weight="heavy" color="foreground" compact>
                    {badgeCount > 9 ? '9+' : String(badgeCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text
              variant="caption"
              size="xs"
              weight={isFocused ? 'bold' : 'medium'}
              color={isFocused ? 'inverse' : 'muted'}
              compact
              style={s.label}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function TabNavigator() {
  const { boletosActivos, encomiendasActivas } = useActivity();

  const badges = useMemo(
    () => ({ boletos: boletosActivos, encomiendas: encomiendasActivas }),
    [boletosActivos, encomiendasActivas]
  );

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...(props as unknown as TabBarProps)} badges={badges} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="encomiendas" options={{ title: 'Encomiendas' }} />
      <Tabs.Screen name="boletos" options={{ title: 'Boletos' }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ActivityProvider>
      <TabNavigator />
    </ActivityProvider>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Layout.tabBar.sideInset,
    right: Layout.tabBar.sideInset,
    height: Layout.tabBar.height,
    paddingHorizontal: Layout.tabBar.innerPadding,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    ...Shadows.elevated,
  },
  indicator: {
    position: 'absolute',
    left: Layout.tabBar.innerPadding,
    height: Layout.tabBar.height - Layout.tabBar.innerPadding * 2,
    // Darker than `accent` so the white label clears 4.5:1 (5.7:1)
    backgroundColor: Colors.tabActive,
    borderRadius: Radius.full,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconWrapper: {
    position: 'relative',
    height: Sizes.icon.xl,
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -Spacing.xs - 1,
    right: -Spacing.md + 2,
    minWidth: Spacing.lg,
    height: Spacing.lg,
    paddingHorizontal: Spacing.xs / 2,
    borderRadius: Radius.full,
    // Texto oscuro sobre el amarillo de marca (≈ 13:1). Antes era blanco sobre
    // coral (2,6:1), ilegible para muchos.
    backgroundColor: Colors.primary,
    borderWidth: Sizes.hairline,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: Spacing.xs / 2,
    fontSize: Layout.tabBar.labelSize,
  },
});
