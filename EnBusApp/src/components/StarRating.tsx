import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Star } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Text } from '@/src/components/ui';
import { Colors, Motion, Sizes, Spacing } from '@/src/theme';

interface StarRatingProps {
  maxStars?: number;
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
}

function AnimatedStar({
  index,
  filled,
  onPress,
  readonly,
  maxStars,
}: {
  index: number;
  filled: boolean;
  onPress: () => void;
  readonly: boolean;
  maxStars: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (readonly) return;
    scale.value = withSequence(
      withSpring(1.3, Motion.spring.bouncy),
      withSpring(1, Motion.spring.snappy)
    );
    onPress();
  };

  return (
    <PressableScale
      disabled={readonly}
      onPress={handlePress}
      scaleValue={Motion.press.icon}
      duration={Motion.duration.instant}
      haptic
      hapticType="light"
      style={s.star}
      accessibilityLabel={`${index + 1} de ${maxStars} estrellas`}
      accessibilityRole={readonly ? undefined : 'button'}
      accessibilityState={readonly ? undefined : { selected: filled }}
    >
      <Animated.View style={animStyle}>
        <Star
          size={Sizes.icon.xl}
          weight={filled ? 'fill' : 'regular'}
          color={filled ? Colors.primary : Colors.border}
        />
      </Animated.View>
    </PressableScale>
  );
}

export function StarRating({
  maxStars = 5,
  rating,
  onRatingChange,
  readonly = false,
}: StarRatingProps) {
  return (
    <View
      style={s.container}
      accessibilityRole={readonly ? 'image' : 'radiogroup'}
      accessibilityLabel={
        readonly ? `Calificación: ${rating} de ${maxStars} estrellas` : 'Calificar el viaje'
      }
    >
      {Array.from({ length: maxStars }).map((_, index) => (
        <AnimatedStar
          key={index}
          index={index}
          filled={index + 1 <= Math.round(rating)}
          onPress={() => onRatingChange?.(index + 1)}
          readonly={readonly}
          maxStars={maxStars}
        />
      ))}

      {!readonly && (
        <Text variant="label" color="muted" style={s.label}>
          {rating > 0 ? `${rating}/${maxStars}` : 'Toca para calificar'}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    padding: Spacing.xs,
  },
  label: {
    marginLeft: Spacing.sm,
  },
});
