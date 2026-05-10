import React from 'react';
import { View, Text, Pressable } from '@/tw';
import { Star } from 'phosphor-react-native';

interface StarRatingProps {
  maxStars?: number;
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
}

export function StarRating({ maxStars = 5, rating, onRatingChange, readonly = false }: StarRatingProps) {
  return (
    <View className="flex-row items-center space-x-1">
      {Array.from({ length: maxStars }).map((_, index) => {
        const value = index + 1;
        const isFilled = value <= Math.round(rating);

        return (
          <Pressable 
            key={index} 
            disabled={readonly}
            onPress={() => onRatingChange?.(value)}
            className="p-1"
          >
            <Star 
              size={24} 
              weight={isFilled ? 'fill' : 'regular'} 
              color={isFilled ? '#e2b714' : '#a3a3a3'} 
            />
          </Pressable>
        );
      })}
      {!readonly && (
        <Text className="text-sm font-bold text-muted-foreground ml-2">
          {rating > 0 ? `${rating}/${maxStars}` : 'Calificar'}
        </Text>
      )}
    </View>
  );
}
