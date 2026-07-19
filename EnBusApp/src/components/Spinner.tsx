import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useCSSVariable } from '@/tw';
import { Colors } from '@/src/theme';

export function Spinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  // Obtenemos el color primario del tema
  const primaryColor = useCSSVariable('--primary');
  
  // Si no se logra resolver la variable CSS en runtime, fallback al default de la marca
  return <ActivityIndicator size={size} color={(primaryColor as string) || Colors.primary} />;
}
