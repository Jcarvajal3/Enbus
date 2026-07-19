import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface StaggerItemProps {
  /** Índice del item en la lista. Determina el delay. */
  index: number;
  /** Delay base entre items en ms. Default 45. */
  delayStep?: number;
  /** Duración de la animación en ms. Default 280. */
  duration?: number;
  /** Distancia vertical de desplazamiento inicial. Default 14. */
  translateYStart?: number;
  children: React.ReactNode;
}

/**
 * StaggerItem — anima cada item de lista con fade-in + slide-up escalonado.
 *
 * Uso en FlatList renderItem:
 *   ({ item, index }) => (
 *     <StaggerItem index={index}>
 *       <MyCard ... />
 *     </StaggerItem>
 *   )
 *
 * Principios:
 *   - Solo opacity + transform (GPU, sin layout thrashing)
 *   - withDelay en UI thread — sin setTimeout en JS thread
 *   - Limita el stagger máximo a 300ms total (cap en index >= 7)
 */
export function StaggerItem({
  index,
  delayStep = 45,
  duration = 280,
  translateYStart = 14,
  children,
}: StaggerItemProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(translateYStart);

  // Cap delay en 315ms para que items fuera de pantalla no esperen demasiado
  const cappedIndex = Math.min(index, 7);
  const delay = cappedIndex * delayStep;

  const easeOut = Easing.out(Easing.cubic);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: easeOut }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: easeOut }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
