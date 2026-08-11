import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Colors } from '@/src/theme';

/**
 * Inline activity indicator. For full-block waits use `<LoadingState />` from
 * the UI kit — it also carries a label.
 */
export function Spinner({
  size = 'small',
  color = Colors.accent,
}: {
  size?: 'small' | 'large';
  color?: string;
}) {
  return <ActivityIndicator size={size} color={color} accessibilityLabel="Cargando" />;
}
