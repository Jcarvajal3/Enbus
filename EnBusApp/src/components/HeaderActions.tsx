/**
 * HeaderActions — campana con contador y acceso al perfil, a la derecha de la
 * cabecera de las tres pestañas (APP-09):
 *
 *   <ScreenHeader title="Mis boletos" right={<HeaderActions />} />
 *
 * El contador sale de `ActivityContext` (un solo canal para toda la app), así
 * que debe usarse dentro de `ActivityProvider` (el grupo de pestañas).
 * Ambos iconos en peso `regular` (AN-23, D21).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, UserCircle } from 'phosphor-react-native';
import { IconButton } from '@/src/components/ui';
import { useActivity } from '@/src/contexts/ActivityContext';
import { Spacing } from '@/src/theme';

export function HeaderActions() {
  const router = useRouter();
  const { notificacionesSinLeer } = useActivity();

  return (
    <View style={s.row}>
      <IconButton
        icon={Bell}
        label={
          notificacionesSinLeer > 0
            ? `Notificaciones, ${notificacionesSinLeer} sin leer`
            : 'Notificaciones'
        }
        badgeCount={notificacionesSinLeer}
        iconWeight="regular"
        variant="raised"
        onPress={() => router.push('/notificaciones')}
      />
      <IconButton
        icon={UserCircle}
        iconWeight="regular"
        variant="raised"
        label="Mi perfil"
        onPress={() => router.push('/perfil')}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
