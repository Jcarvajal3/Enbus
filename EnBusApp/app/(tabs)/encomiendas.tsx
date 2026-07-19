import { SafeAreaView } from '@/tw';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text } from '@/tw';
import { FlatList, RefreshControl, ListRenderItem, StyleSheet } from 'react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { Plus, DownloadSimple, UploadSimple } from 'phosphor-react-native';
import { formatDate } from '@/src/utils/formatters';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { Colors, Typography, Radius, Shadows, Gradients } from '@/src/theme';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export default function EncomiendasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'recibir' | 'enviar'>('recibir');
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const [refreshing, setRefreshing] = useState(false);

  const { data: todasLasEncomiendas, loading, refetch } = useEncomiendas(user?.id, {
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

  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorWidth = useSharedValue(0);
  const translateX = useSharedValue(0);

  const onTrackLayout = (event: any) => {
    const width = event.nativeEvent.layout.width;
    setTrackWidth(width);
    const padding = 8;
    const usableWidth = width - padding;
    const tabWidth = usableWidth / 2;
    indicatorWidth.value = tabWidth;
    translateX.value = (tab === 'recibir' ? 0 : 1) * tabWidth;
  };

  useEffect(() => {
    if (trackWidth > 0) {
      const padding = 8;
      const tabWidth = (trackWidth - padding) / 2;
      translateX.value = withTiming((tab === 'recibir' ? 0 : 1) * tabWidth, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [tab, trackWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: indicatorWidth.value,
    };
  });

  const historial = useMemo(
    () =>
      (todasLasEncomiendas || []).filter((enc: any) => {
        if (tab === 'enviar') return enc.sender_id === user?.id;
        return enc.receiver_user_id === user?.id;
      }),
    [todasLasEncomiendas, tab, user?.id]
  );

  const renderItem = useCallback<ListRenderItem<any>>(({ item: enc, index }) => (
    <StaggerItem index={index}>
      <View style={s.cardRow}>
        <TransactionCard
          type={tab === 'enviar' ? 'encomienda_envio' : 'encomienda_recepcion'}
          id={enc.tracking_id || enc.id}
          estado={enc.estado}
          titulo={tab === 'enviar' ? 'Envío Regular' : 'Paquete Entrante'}
          subtitulo={formatDate(enc.created_at)}
          onPress={() =>
            router.push({
              pathname:
                tab === 'enviar'
                  ? '/encomiendas/enviar/[id]' as any
                  : '/encomiendas/recibir/[id]' as any,
              params: { id: enc.id },
            })
          }
        />
      </View>
    </StaggerItem>
  ), [tab, router]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyComponent = useMemo(
    () => (
      <View style={s.empty}>
        <View style={s.emptyIcon}>
          <Plus color={Colors.mutedForeground} weight="bold" size={32} />
        </View>
        <Text style={s.emptyTitle}>Sin encomiendas</Text>
        <Text style={s.emptySubtitle}>
          {tab === 'enviar'
            ? 'No tienes envíos registrados por los momentos.'
            : 'No tienes paquetes en camino hacia ti.'}
        </Text>
      </View>
    ),
    [tab]
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: Colors.background }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Mis Paquetes</Text>
        <Text style={s.headerSubtitle}>
          Consulta y realiza el seguimiento de tus envíos
        </Text>
      </View>

      <View style={s.tabContainer}>
        <View style={s.tabRow} onLayout={onTrackLayout}>
          {trackWidth > 0 && (
            <Animated.View style={[s.tabIndicator, animatedIndicatorStyle]} />
          )}
          <PressableScale
            onPress={() => setTab('recibir')}
            haptic
            style={s.tab}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DownloadSimple
                color={tab === 'recibir' ? Colors.foreground : Colors.mutedForeground}
                weight={tab === 'recibir' ? 'bold' : 'regular'}
                size={15}
              />
              <Text style={[s.tabText, tab === 'recibir' && s.tabTextActive]}>Para Mí</Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => setTab('enviar')}
            haptic
            style={s.tab}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <UploadSimple
                color={tab === 'enviar' ? Colors.foreground : Colors.mutedForeground}
                weight={tab === 'enviar' ? 'bold' : 'regular'}
                size={15}
              />
              <Text style={[s.tabText, tab === 'enviar' && s.tabTextActive]}>Enviados</Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 24 }}>
          <CardSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          data={historial}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={{ padding: 24, paddingBottom: 128 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

      <View style={s.fab}>
        <PressableScale
          onPress={() => router.push('/encomiendas/nueva')}
          haptic
          hapticType="medium"
          style={s.fabButton}
        >
          <LinearGradient
            colors={[...Gradients.warm]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.fabGradient}
          >
            <Plus color={Colors.white} weight="bold" size={20} />
            <Text style={s.fabText}>Crear Nuevo Envío</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes['3xl'],
    color: Colors.foreground,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
  },
  tabContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  cardRow: { marginBottom: 0 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    alignItems: 'center',
    zIndex: 2,
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    left: 4,
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.mutedForeground,
  },
  tabTextActive: {
    color: Colors.foreground,
  },
  empty: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.surface,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    left: 24,
    right: 24,
  },
  fabButton: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    ...Shadows.glow(Colors.secondary),
  },
  fabGradient: {
    height: 52,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  fabText: {
    color: Colors.white,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 16,
  },
});
