import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Star } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
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

/** Semantic feedback per level (5-star scale) — "4/5" alone says little. */
const NIVELES = ['Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

/**
 * APP-38: 32 pt glyph + 8 pt padding = 48 pt target (was 34). The empty star
 * has a `mutedForeground` outline (5.7:1) instead of the near-invisible
 * `border`, and the filled one keeps the brand yellow with a dark amber
 * outline so it reads on white (WCAG 1.4.11).
 */
const STAR_SIZE = Sizes.icon['2xl'];

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
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (readonly) return;
    // Con "reducir movimiento" la estrella se rellena sin rebotar.
    if (!reduceMotion) {
      scale.value = withSequence(
        withSpring(1.3, Motion.spring.bouncy),
        withSpring(1, Motion.spring.snappy)
      );
    }
    onPress();
  };

  const nivel = maxStars === NIVELES.length ? ` (${NIVELES[index]})` : '';

  const glyph = filled ? (
    <View>
      <Star size={STAR_SIZE} weight="fill" color={Colors.primary} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Star size={STAR_SIZE} weight="regular" color={Colors.primaryText} />
      </View>
    </View>
  ) : (
    <Star size={STAR_SIZE} weight="regular" color={Colors.mutedForeground} />
  );

  // A read-only rating is a picture, not a disabled control: render it at full
  // opacity (PressableScale dims disabled children).
  if (readonly) return <View style={s.star}>{glyph}</View>;

  return (
    <PressableScale
      onPress={handlePress}
      scaleValue={Motion.press.icon}
      duration={Motion.duration.instant}
      haptic
      hapticType="light"
      style={s.star}
      accessibilityLabel={`${index + 1} de ${maxStars} estrellas${nivel}`}
      accessibilityRole="button"
      accessibilityState={{ selected: filled }}
    >
      <Animated.View style={animStyle}>{glyph}</Animated.View>
    </PressableScale>
  );
}

export function StarRating({
  maxStars = 5,
  rating,
  onRatingChange,
  readonly = false,
}: StarRatingProps) {
  const rounded = Math.round(rating);
  const nivel = maxStars === NIVELES.length && rounded > 0 ? NIVELES[rounded - 1] : null;

  return (
    <View
      style={s.container}
      // Read-only stars have no accessible children: expose the group as one element.
      accessible={readonly}
      accessibilityRole={readonly ? 'image' : 'radiogroup'}
      accessibilityLabel={
        readonly
          ? `Calificación: ${rating} de ${maxStars} estrellas${nivel ? ` (${nivel})` : ''}`
          : 'Calificar el viaje'
      }
    >
      <View style={s.stars}>
        {Array.from({ length: maxStars }).map((_, index) => (
          <AnimatedStar
            key={index}
            index={index}
            filled={index + 1 <= rounded}
            onPress={() => onRatingChange?.(index + 1)}
            readonly={readonly}
            maxStars={maxStars}
          />
        ))}
      </View>

      {!readonly && (
        <Text variant="label" color="muted" style={s.label}>
          {rating > 0 ? (nivel ?? `${rating}/${maxStars}`) : 'Toca una estrella para calificar'}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    // Compensates the touch padding so the first star lines up with the text.
    marginLeft: -Spacing.sm,
  },
  star: {
    padding: Spacing.sm,
  },
  label: {
    marginTop: Spacing.xs,
  },
});
