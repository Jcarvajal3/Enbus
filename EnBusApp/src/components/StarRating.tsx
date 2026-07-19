import React from 'react';
import { View, Text } from '@/tw';
import { Star } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/src/theme';

interface StarRatingProps {
  maxStars?: number;
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
}

function AnimatedStar({
  index,
  isFilled,
  onPress,
  readonly,
  maxStars,
}: {
  index: number;
  isFilled: boolean;
  onPress: () => void;
  readonly: boolean;
  maxStars: number;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (readonly) return;
    scale.value = withSpring(1.3, { damping: 8, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
    });
    onPress();
  };

  return (
    <PressableScale
      key={index}
      disabled={readonly}
      onPress={handlePress}
      scaleValue={0.88}
      duration={100}
      haptic
      hapticType="light"
      style={styles.starPressable}
      accessibilityLabel={`Estrella ${index + 1} de ${maxStars}`}
      accessibilityRole={readonly ? undefined : 'button'}
      accessibilityState={readonly ? {} : { selected: isFilled }}
    >
      <Animated.View style={animStyle}>
        <Star
          size={26}
          weight={isFilled ? 'fill' : 'regular'}
          color={isFilled ? Colors.primary : Colors.border}
        />
      </Animated.View>
    </PressableScale>
  );
}

export function StarRating({ maxStars = 5, rating, onRatingChange, readonly = false }: StarRatingProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }).map((_, index) => {
        const value = index + 1;
        const isFilled = value <= Math.round(rating);

        return (
          <AnimatedStar
            key={index}
            index={index}
            isFilled={isFilled}
            onPress={() => onRatingChange?.(value)}
            readonly={readonly}
            maxStars={maxStars}
          />
        );
      })}
      {!readonly && (
        <Text style={styles.ratingText}>
          {rating > 0 ? `${rating}/${maxStars}` : 'Calificar'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starPressable: {
    padding: Spacing.xs,
  },
  ratingText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    marginLeft: Spacing.sm,
  },
});
