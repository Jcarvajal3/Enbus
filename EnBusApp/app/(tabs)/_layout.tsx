import { Tabs } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Package, Ticket, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from '@/src/components/PressableScale';
import { Text } from '@/src/components/ui';
import { ActivityProvider, useActivity } from '@/src/contexts/ActivityContext';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

/** Pestañas: Inicio · Boletos · Encomiendas. */
const TAB_ICONS: Record<string, React.ComponentType<IconProps>> = {
  index: House,
  boletos: Ticket,
  encomiendas: Package,
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

/**
 * La barra es noche flotando sobre un fondo claro: el ancla oscura de la pantalla. La
 * pestaña activa es una pastilla blanca que se desliza con un resorte: el sol queda
 * reservado para la acción principal, que nunca compite con la navegación.
 */
function CustomTabBar({ state, descriptors, navigation, badges }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);

  const tabCount = state.routes.length;
  const tabWidth =
    barWidth > 0 ? (barWidth - Layout.tabBar.innerPadding * 2) / tabCount : 0;

  const translateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    if (tabWidth <= 0) return;
    indicatorWidth.value = tabWidth;
    const destino = state.index * tabWidth;
    // Con "reducir movimiento" la pastilla salta a la pestaña sin deslizarse.
    translateX.value = reduceMotion ? destino : withSpring(destino, Motion.spring.snappy);
  }, [state.index, tabWidth, indicatorWidth, translateX, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      // The bar floats, so it must clear the device's own bottom inset.
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
                color={isFocused ? Colors.foreground : Colors.tabInactive}
                weight={isFocused ? 'fill' : 'regular'}
              />
              {badgeCount > 0 && (
                <View style={[s.badge, isFocused && s.badgeActivo]}>
                  <Text
                    variant="caption"
                    size="micro"
                    weight="bold"
                    color={isFocused ? 'inverse' : 'foreground'}
                    compact
                  >
                    {badgeCount > 9 ? '9+' : String(badgeCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text
              variant="caption"
              size="xs"
              weight={isFocused ? 'semibold' : 'medium'}
              color={isFocused ? 'foreground' : Colors.tabInactive}
              compact
              numberOfLines={1}
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
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Colors.canvas } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="boletos" options={{ title: 'Boletos' }} />
      <Tabs.Screen name="encomiendas" options={{ title: 'Encomiendas' }} />
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
    backgroundColor: Colors.tabBackground,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    ...Shadows.tabBar,
  },
  indicator: {
    position: 'absolute',
    left: Layout.tabBar.innerPadding,
    height: Layout.tabBar.height - Layout.tabBar.innerPadding * 2,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    backgroundColor: Colors.background,
    ...Shadows.subtle,
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
    height: Sizes.icon.lg,
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -Spacing.xs,
    right: -Spacing.md,
    minWidth: Sizes.counter - Spacing.xs / 2,
    height: Sizes.counter - Spacing.xs / 2,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sobre la pastilla blanca, la insignia se invierte para no perderse.
  badgeActivo: {
    backgroundColor: Colors.night,
  },
  label: {
    marginTop: Spacing.xs / 2,
  },
});
