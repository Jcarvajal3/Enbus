import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useCSSVariable } from '@/tw';

export function Spinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  // Obtenemos el color primario del tema
  const primaryColor = useCSSVariable('--primary');
  
  // Si no se logra resolver la variable CSS en runtime, fallback al default Maia
  return <ActivityIndicator size={size} color={(primaryColor as string) || '#e2b714'} />;
}
