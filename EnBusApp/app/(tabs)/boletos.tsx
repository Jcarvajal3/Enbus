import { useCallback, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Bus, CheckCircle, ClockCountdown } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Button,
  EmptyState,
  FloatingBar,
  Gutter,
  Screen,
  ScreenHeader,
  SegmentedControl,
  scrollContent,
} from '@/src/components/ui';
import { formatCity, formatDate } from '@/src/utils/formatters';
import {
  BOLETO_ESTADOS_ACTIVOS,
  BOLETO_ESTADOS_HISTORIAL,
} from '@/src/utils/estados';
import { Colors, Spacing } from '@/src/theme';

type TabType = 'activos' | 'historial';

interface BoletoRow {
  id: string;
  codigo_boleto?: string;
  estado: string;
  created_at: string;
  viajes?: { rutas?: { ciudad_origen?: string; ciudad_destino?: string } };
}

export default function BoletosScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [isFocused, setIsFocused] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('activos');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const { data: historial, loading, refetch } = useRealtime<BoletoRow>(
    'boletos',
    'comprador_id',
    user?.id,
    '*, viajes(*, rutas(ciudad_origen, ciudad_destino))',
    { enabled: isFocused && !!user?.id, limit: 30 }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const counts = useMemo(() => {
    const rows = historial ?? [];
    return {
      activos: rows.filter((b) => (BOLETO_ESTADOS_ACTIVOS as readonly string[]).includes(b.estado))
        .length,
      historial: rows.filter((b) =>
        (BOLETO_ESTADOS_HISTORIAL as readonly string[]).includes(b.estado)
      ).length,
    };
  }, [historial]);

  const filteredData = useMemo(() => {
    if (!historial) return [];
    const target =
      activeTab === 'activos' ? BOLETO_ESTADOS_ACTIVOS : BOLETO_ESTADOS_HISTORIAL;
    return historial.filter((b) => (target as readonly string[]).includes(b.estado));
  }, [historial, activeTab]);

  const renderItem = useCallback<ListRenderItem<BoletoRow>>(
    ({ item, index }) => (
      <StaggerItem index={index}>
        <TransactionCard
          type="boleto"
          id={item.codigo_boleto || item.id}
          estado={item.estado}
          titulo={`${formatCity(item.viajes?.rutas?.ciudad_origen) || 'Origen'} → ${
            formatCity(item.viajes?.rutas?.ciudad_destino) || 'Destino'
          }`}
          subtitulo={formatDate(item.created_at)}
          onPress={() =>
            router.push({
              pathname: '/boletos/[id]',
              params: { id: item.codigo_boleto || item.id },
            })
          }
        />
      </StaggerItem>
    ),
    [router]
  );

  const emptyComponent = useMemo(
    () =>
      activeTab === 'activos' ? (
        <EmptyState
          icon={CheckCircle}
          title="Sin boletos activos"
          description="Aquí verás tus boletos reservados y pagados. Empieza por buscar un viaje."
          action={{
            children: 'Buscar Viaje',
            icon: Bus,
            variant: 'accent',
            onPress: () => router.push('/boletos/buscar'),
          }}
        />
      ) : (
        <EmptyState
          icon={ClockCountdown}
          title="Sin historial aún"
          description="Tus viajes completados, cancelados y expirados aparecerán aquí."
        />
      ),
    [activeTab, router]
  );

  return (
    <Screen>
      <ScreenHeader title="Mis Viajes" subtitle="Gestiona y consulta tus pasajes" />

      <Gutter style={{ paddingBottom: Spacing.lg }}>
        <SegmentedControl<TabType>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'activos', label: 'Activos', icon: CheckCircle, badge: counts.activos },
            { value: 'historial', label: 'Historial', icon: ClockCountdown },
          ]}
        />
      </Gutter>

      {loading ? (
        <Gutter>
          <CardSkeleton count={3} />
        </Gutter>
      ) : (
        <FlatList
          data={filteredData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={scrollContent({
            tabbed: true,
            floatingAction: filteredData.length > 0,
            top: 0,
          })}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.accent]}
              tintColor={Colors.accent}
            />
          }
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

      {/* Hidden on the empty state — the empty state already offers the action. */}
      {filteredData.length > 0 && (
        <FloatingBar tabbed>
          <Button
            variant="gradient"
            icon={Bus}
            glow
            fullWidth
            onPress={() => router.push('/boletos/buscar')}
          >
            Buscar Viaje
          </Button>
        </FloatingBar>
      )}
    </Screen>
  );
}
