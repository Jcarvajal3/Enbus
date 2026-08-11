import { useCallback, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { DownloadSimple, Package, Plus, UploadSimple } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
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
import { formatDate } from '@/src/utils/formatters';
import { isEncomiendaActiva } from '@/src/utils/estados';
import type { Encomienda } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

type BuzonTab = 'recibir' | 'enviar';

export default function EncomiendasScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<BuzonTab>('recibir');
  const [isFocused, setIsFocused] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const { data: todas, loading, refetch } = useEncomiendas(user?.id, {
    enabled: isFocused && !!user?.id,
    limit: 30,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const buckets = useMemo(() => {
    const rows: Encomienda[] = todas ?? [];
    return {
      recibir: rows.filter((e) => e.receiver_user_id === user?.id),
      enviar: rows.filter((e) => e.sender_id === user?.id),
    };
  }, [todas, user?.id]);

  const listData = buckets[tab];

  const renderItem = useCallback<ListRenderItem<Encomienda>>(
    ({ item, index }) => (
      <StaggerItem index={index}>
        <TransactionCard
          type={tab === 'enviar' ? 'encomienda_envio' : 'encomienda_recepcion'}
          id={item.tracking_id || item.id}
          estado={item.estado}
          titulo={
            item.ciudad_origen && item.ciudad_destino
              ? `${item.ciudad_origen} → ${item.ciudad_destino}`
              : tab === 'enviar'
                ? 'Envío registrado'
                : 'Paquete entrante'
          }
          subtitulo={formatDate(item.created_at)}
          onPress={() =>
            router.push({
              pathname:
                tab === 'enviar'
                  ? ('/encomiendas/enviar/[id]' as const)
                  : ('/encomiendas/recibir/[id]' as const),
              params: { id: item.id },
            })
          }
        />
      </StaggerItem>
    ),
    [tab, router]
  );

  const emptyComponent = useMemo(
    () =>
      tab === 'enviar' ? (
        <EmptyState
          icon={UploadSimple}
          title="Sin envíos registrados"
          description="Cuando registres un paquete para enviar, lo verás aquí con su seguimiento."
          action={{
            children: 'Crear Nuevo Envío',
            icon: Plus,
            variant: 'accent',
            onPress: () => router.push('/encomiendas/nueva'),
          }}
        />
      ) : (
        <EmptyState
          icon={Package}
          title="Sin paquetes en camino"
          description="Los paquetes que otras personas te envíen aparecerán aquí automáticamente."
        />
      ),
    [tab, router]
  );

  return (
    <Screen>
      <ScreenHeader
        title="Mis Paquetes"
        subtitle="Consulta y realiza el seguimiento de tus envíos"
      />

      <Gutter style={{ paddingBottom: Spacing.lg }}>
        <SegmentedControl<BuzonTab>
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'recibir',
              label: 'Para Mí',
              icon: DownloadSimple,
              badge: buckets.recibir.filter((e) => isEncomiendaActiva(e.estado)).length,
            },
            {
              value: 'enviar',
              label: 'Enviados',
              icon: UploadSimple,
              badge: buckets.enviar.filter((e) => isEncomiendaActiva(e.estado)).length,
            },
          ]}
        />
      </Gutter>

      {loading ? (
        <Gutter>
          <CardSkeleton count={3} />
        </Gutter>
      ) : (
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={scrollContent({
            tabbed: true,
            floatingAction: listData.length > 0,
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

      {listData.length > 0 && (
        <FloatingBar tabbed>
          <Button
            variant="gradient"
            icon={Plus}
            glow
            fullWidth
            onPress={() => router.push('/encomiendas/nueva')}
          >
            Crear Nuevo Envío
          </Button>
        </FloatingBar>
      )}
    </Screen>
  );
}
