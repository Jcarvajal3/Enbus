import { SafeAreaView } from '@/tw';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text } from '@/tw';
import { FlatList, RefreshControl, ListRenderItem, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useRouter } from 'expo-router';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { Modal } from 'react-native';
import { Ticket, Bus, X, ClockCountdown, CheckCircle } from 'phosphor-react-native';
import { SearchForm } from '@/src/components/SearchForm';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate, formatCity } from '@/src/utils/formatters';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Radius, Shadows, Gradients } from '@/src/theme';

// ─── Estado helpers ───────────────────────────────────────────────────────────
const ACTIVE_STATES = ['RESERVADO', 'PAGADO'];
const HISTORY_STATES = ['USADO', 'CANCELADO', 'EXPIRADO'];

type TabType = 'activos' | 'historial';

export default function BoletosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('activos');

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
    translateX.value = (activeTab === 'activos' ? 0 : 1) * tabWidth;
  };

  useEffect(() => {
    if (trackWidth > 0) {
      const padding = 8;
      const tabWidth = (trackWidth - padding) / 2;
      translateX.value = withTiming((activeTab === 'activos' ? 0 : 1) * tabWidth, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [activeTab, trackWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: indicatorWidth.value,
    };
  });

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const [refreshing, setRefreshing] = useState(false);

  const { data: historial, loading, refetch } = useRealtime<any>(
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

  // ─── Filtrado por tab ────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    if (!historial) return [];
    const targetStates = activeTab === 'activos' ? ACTIVE_STATES : HISTORY_STATES;
    return historial.filter((bol: any) => targetStates.includes(bol.estado));
  }, [historial, activeTab]);

  const activeCount = useMemo(
    () => (historial ?? []).filter((bol: any) => ACTIVE_STATES.includes(bol.estado)).length,
    [historial]
  );

  const renderItem = useCallback<ListRenderItem<any>>(({ item: bol, index }) => (
    <StaggerItem index={index}>
      <View style={s.cardRow}>
        <TransactionCard
          type="boleto"
          id={bol.codigo_boleto || bol.id}
          estado={bol.estado}
          titulo={`${formatCity(bol.viajes?.rutas?.ciudad_origen) || 'Origen'} → ${formatCity(bol.viajes?.rutas?.ciudad_destino) || 'Destino'}`}
          subtitulo={formatDate(bol.created_at)}
          onPress={() =>
            router.push({
              pathname: '/boletos/[id]',
              params: { id: bol.codigo_boleto || bol.id },
            })
          }
        />
      </View>
    </StaggerItem>
  ), [router]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyComponent = useMemo(
    () => (
      <View style={s.empty}>
        <View style={s.emptyIcon}>
          {activeTab === 'activos' ? (
            <CheckCircle color={Colors.mutedForeground} weight="bold" size={32} />
          ) : (
            <ClockCountdown color={Colors.mutedForeground} weight="bold" size={32} />
          )}
        </View>
        <Text style={s.emptyTitle}>
          {activeTab === 'activos' ? 'Sin boletos activos' : 'Sin historial aún'}
        </Text>
        <Text style={s.emptySubtitle}>
          {activeTab === 'activos'
            ? 'Aquí verás tus boletos reservados y pagados.'
            : 'Tus viajes completados, cancelados y expirados aparecerán aquí.'}
        </Text>
      </View>
    ),
    [activeTab]
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View style={s.header}>
        <Text style={s.headerTitle}>Mis Viajes</Text>
        <Text style={s.headerSubtitle}>
          Gestiona y consulta tus pasajes
        </Text>
      </View>

      {/* ─── Toggle Activos / Historial ─────────────────────────────── */}
      <View style={s.toggleContainer}>
        <View style={s.toggleTrack} onLayout={onTrackLayout}>
          {trackWidth > 0 && (
            <Animated.View style={[s.toggleIndicator, animatedIndicatorStyle]} />
          )}
          <PressableScale
            onPress={() => setActiveTab('activos')}
            haptic
            hapticType="selection"
            style={s.toggleTab}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle
                color={activeTab === 'activos' ? Colors.foreground : Colors.mutedForeground}
                weight={activeTab === 'activos' ? 'bold' : 'regular'}
                size={15}
              />
              <Text style={[s.toggleText, activeTab === 'activos' && s.toggleTextActive]}>Activos</Text>
              {activeCount > 0 && (
                <View style={[s.badge, activeTab === 'activos' ? s.badgeActiveTab : s.badgeInactive]}>
                  <Text style={[s.badgeText, activeTab === 'activos' ? s.badgeTextActiveTab : s.badgeTextInactive]}>{activeCount}</Text>
                </View>
              )}
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => setActiveTab('historial')}
            haptic
            hapticType="selection"
            style={s.toggleTab}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ClockCountdown
                color={activeTab === 'historial' ? Colors.foreground : Colors.mutedForeground}
                weight={activeTab === 'historial' ? 'bold' : 'regular'}
                size={15}
              />
              <Text style={[s.toggleText, activeTab === 'historial' && s.toggleTextActive]}>Historial</Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {loading ? (
        <View className="p-6">
          <CardSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
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

      {/* FAB con PressableScale */}
      <View style={s.fab}>
        <PressableScale
          onPress={() => router.push('/boletos/buscar')}
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
            <Bus color={Colors.white} weight="bold" size={22} />
            <Text style={s.fabText}>Buscar Viaje</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // ─── Header ──────────────────────────────────────────────────
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

  // ─── Toggle ──────────────────────────────────────────────────
  toggleContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 4,
    gap: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  toggleIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    left: 4,
    zIndex: 1,
  },
  toggleText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
  },
  toggleTextActive: {
    color: Colors.foreground,
  },

  // ─── Badge (contador de activos) ─────────────────────────────
  badge: {
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActiveTab: {
    backgroundColor: Colors.surfaceDark,
  },
  badgeInactive: {
    backgroundColor: Colors.surfaceDark,
  },
  badgeText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 10,
    color: Colors.mutedForeground,
  },
  badgeTextActiveTab: {
    color: Colors.mutedForeground,
  },
  badgeTextInactive: {
    color: Colors.mutedForeground,
  },

  // ─── List ────────────────────────────────────────────────────
  cardRow: { marginBottom: 0 },

  // ─── Empty state ─────────────────────────────────────────────
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
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.xl,
    color: Colors.foreground,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.regular,
    fontSize: Typography.sizes.base,
    color: Colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  // ─── FAB ─────────────────────────────────────────────────────
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
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 16,
    color: Colors.white,
  },

  // ─── Modal ───────────────────────────────────────────────────
  modalHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.xl,
    color: Colors.foreground,
  },
  modalClose: {
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
