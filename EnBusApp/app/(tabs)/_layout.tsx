import { Tabs } from 'expo-router';
import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Shadows } from '@/src/theme';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

function CustomTabBar({ state, descriptors, navigation, encomiendasCount, boletosCount }: any) {
  const [width, setWidth] = useState(0);
  const indicatorWidth = useSharedValue(0);
  const translateX = useSharedValue(0);

  const activeIndex = state.index;

  const onLayout = (event: any) => {
    const containerWidth = event.nativeEvent.layout.width;
    setWidth(containerWidth);
    const padding = 12; // 6px padding on left/right of indicator wrapper
    const usableWidth = containerWidth - padding;
    const tabWidth = usableWidth / 3;
    indicatorWidth.value = tabWidth;
    translateX.value = activeIndex * tabWidth;
  };

  useEffect(() => {
    if (width > 0) {
      const padding = 12;
      const tabWidth = (width - padding) / 3;
      translateX.value = withTiming(activeIndex * tabWidth, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [activeIndex, width]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: indicatorWidth.value,
    };
  });

  return (
    <View style={s.tabBarContainer} onLayout={onLayout}>
      {/* Animated active pill background */}
      {width > 0 && (
        <Animated.View style={[s.indicator, animatedIndicatorStyle]} />
      )}

      {state.routes.map((route: any, index: any) => {
        const { options } = descriptors[route.key];
        const label = options.title !== undefined ? options.title : route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        // Material Icon mappings matching the brand design
        let iconName: keyof typeof MaterialIcons.glyphMap = 'home';
        let badgeCount = 0;

        if (route.name === 'index') {
          iconName = 'home';
        } else if (route.name === 'encomiendas') {
          iconName = 'local-shipping';
          badgeCount = encomiendasCount;
        } else if (route.name === 'boletos') {
          iconName = 'confirmation-number';
          badgeCount = boletosCount;
        }

        const activeColor = Colors.white;
        const inactiveColor = Colors.tabInactive;

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={s.tabItem}
            android_ripple={{ color: 'transparent' }}
          >
            <View style={s.iconWrapper}>
              <MaterialIcons
                name={iconName}
                size={22}
                color={isFocused ? activeColor : inactiveColor}
              />
              {badgeCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, { color: isFocused ? activeColor : inactiveColor }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();

  const { data: boletosActivos } = useRealtime<any>(
    'boletos', 'comprador_id', user?.id, 'id, estado',
    { enabled: !!user?.id, limit: 30 }
  );
  const { data: todasLasEncomiendas } = useEncomiendas(user?.id, {
    enabled: !!user?.id,
    limit: 30,
  });

  const activeBoletosCount = useMemo(
    () =>
      !user
        ? 0
        : (boletosActivos ?? []).filter(
            (b: any) => b.estado === 'RESERVADO' || b.estado === 'PAGADO'
          ).length,
    [user, boletosActivos]
  );

  const activeEncomiendasCount = useMemo(
    () =>
      !user
        ? 0
        : (todasLasEncomiendas ?? []).filter(
            (e: any) =>
              e.estado !== 'ENTREGADA' &&
              e.estado !== 'CANCELADA' &&
              e.estado !== 'DEVUELTA'
          ).length,
    [user, todasLasEncomiendas]
  );

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          encomiendasCount={activeEncomiendasCount}
          boletosCount={activeBoletosCount}
        />
      )}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="encomiendas" options={{ title: 'Encomiendas' }} />
      <Tabs.Screen name="boletos" options={{ title: 'Boletos' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    height: 70,
    backgroundColor: Colors.surface, // #F0EFEB
    borderRadius: Radius.full, // 999
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    zIndex: 100,
  },
  indicator: {
    position: 'absolute',
    height: 58,
    backgroundColor: Colors.accent, // #4A7FF8
    borderRadius: Radius.full,
    left: 6,
    zIndex: 1,
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconWrapper: {
    position: 'relative',
    height: 24,
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.medium,
    marginTop: 3,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    backgroundColor: Colors.secondary, // Coral
    borderRadius: Radius.sm - 2, // 8
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 8,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
});
