import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { Package, House, Ticket } from 'phosphor-react-native';
import { useCSSVariable } from '@/tw';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';

export default function TabLayout() {
  const activeColor = useCSSVariable('--primary') || '#e2b714';
  const inactiveColor = useCSSVariable('--muted-foreground') || '#a3a3a3';
  const bgColor = useCSSVariable('--background') || '#ffffff';
  const borderColor = useCSSVariable('--border') || '#e5e5e5';

  const { user } = useAuth();

  // Suscripción a boletos activos
  const { data: boletosActivos } = useRealtime<any>(
    'boletos',
    'comprador_id',
    user?.id,
    'id, estado',
    { enabled: !!user?.id, limit: 30 }
  );

  // Suscripción a encomiendas activas
  const { data: todasLasEncomiendas } = useEncomiendas(user?.id, {
    enabled: !!user?.id,
    limit: 30,
  });

  // PERF-02: useMemo prevents badge counts from being recalculated on every
  // render of this component (e.g. theme variable changes, navigation events).
  const activeBoletosCount = useMemo(() =>
    !user ? 0 : (boletosActivos ?? []).filter(
      b => b.estado === 'RESERVADO' || b.estado === 'PAGADO'
    ).length
  , [user, boletosActivos]);

  const activeEncomiendasCount = useMemo(() =>
    !user ? 0 : (todasLasEncomiendas ?? []).filter(
      e => e.estado !== 'ENTREGADA' && e.estado !== 'CANCELADA' && e.estado !== 'DEVUELTA'
    ).length
  , [user, todasLasEncomiendas]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor as string,
        tabBarInactiveTintColor: inactiveColor as string,
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: borderColor as string,
          backgroundColor: bgColor as string,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Lora-SemiBold', // Fallback solucionado según Spec §2.3
          fontSize: 12,
          fontWeight: '600'
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <House size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="encomiendas"
        options={{
          title: 'Encomiendas',
          tabBarIcon: ({ color }) => <Package size={24} color={color} weight="fill" />,
          tabBarBadge: activeEncomiendasCount > 0 ? activeEncomiendasCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: activeColor as string,
            color: '#ffffff',
            fontSize: 10,
            lineHeight: 12,
          }
        }}
      />
      <Tabs.Screen
        name="boletos"
        options={{
          title: 'Boletos',
          tabBarIcon: ({ color }) => <Ticket size={24} color={color} weight="fill" />,
          tabBarBadge: activeBoletosCount > 0 ? activeBoletosCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: activeColor as string,
            color: '#ffffff',
            fontSize: 10,
            lineHeight: 12,
          }
        }}
      />
    </Tabs>
  );
}
