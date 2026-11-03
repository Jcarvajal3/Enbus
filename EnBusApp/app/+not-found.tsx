/**
 * Ruta que no existe (enlace viejo o mal copiado): misma cabecera y vacío que
 * "Boleto no encontrado", con salida a Inicio. Sustituye la pantalla en inglés
 * de Expo Router ("Unmatched Route").
 */
import { useRouter } from 'expo-router';
import { House, MapTrifold } from 'phosphor-react-native';
import { EmptyState, Screen, ScreenHeader } from '@/src/components/ui';
import { useVolver } from '@/src/hooks/useVolver';

export default function NoEncontrada() {
  const router = useRouter();
  const volver = useVolver('/(tabs)');
  return (
    <Screen>
      <ScreenHeader variant="compact" title="EnBus" onBack={volver} />
      <EmptyState
        icon={MapTrifold}
        title="No encontramos esta página"
        description="El enlace puede estar incompleto o ser antiguo."
        action={{ children: 'Ir a Inicio', icon: House, onPress: () => router.replace('/(tabs)') }}
      />
    </Screen>
  );
}
