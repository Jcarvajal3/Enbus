import { SafeAreaView, View, Text } from '@/tw';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, RefreshControl, StyleSheet } from 'react-native';
import { CaretLeft, Bell, CheckSquare } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { formatDate } from '@/src/utils/formatters';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { PageTransition } from '@/src/components/PageTransition';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Radius, Shadows } from '@/src/theme';

/** P2: Dot pulsante para notificaciones no leidas */
function PulseDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 600, easing: ease }),
        withTiming(1, { duration: 600, easing: ease })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 600, easing: ease }),
        withTiming(1, { duration: 600, easing: ease })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.pulseDot,
        animStyle,
      ]}
    />
  );
}

export default function NotificacionesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [refreshing, setRefreshing] = useState(false);

  const { data: notificaciones, loading, setData, refetch } = useRealtime<any>(
    'notificaciones_usuario',
    'usuario_id',
    user?.id,
    '*',
    { enabled: !!user?.id, limit: 50 }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const [markingAll, setMarkingAll] = useState(false);

  const handleMarkAsRead = async (notif: any) => {
    if (notif.leida) {
      handleNavigate(notif);
      return;
    }
    try {
      const { error } = await supabase
        .from('notificaciones_usuario')
        .update({ leida: true })
        .eq('id', notif.id);
      if (error) throw error;
      handleNavigate(notif);
    } catch (err: any) {
      console.error('Error marking notification as read:', err.message);
    }
  };

  const handleNavigate = async (notif: any) => {
    if (!notif.recurso_tipo || !notif.recurso_id) return;
    if (notif.recurso_tipo === 'boleto') {
      router.push({ pathname: '/boletos/[id]', params: { id: notif.recurso_id } });
    } else if (notif.recurso_tipo === 'encomienda') {
      try {
        const { data, error } = await supabase
          .from('encomiendas')
          .select('sender_id')
          .eq('id', notif.recurso_id)
          .single();
        if (error) throw error;
        if (data.sender_id === user?.id) {
          router.push({ pathname: '/encomiendas/enviar/[id]', params: { id: notif.recurso_id } });
        } else {
          router.push({ pathname: '/encomiendas/recibir/[id]', params: { id: notif.recurso_id } });
        }
      } catch (err) {
        router.push({ pathname: '/encomiendas/enviar/[id]', params: { id: notif.recurso_id } });
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const unread = (notificaciones ?? []).filter(n => !n.leida);
    if (unread.length === 0) return;
    try {
      setMarkingAll(true);
      const { error } = await supabase
        .from('notificaciones_usuario')
        .update({ leida: true })
        .eq('usuario_id', user.id)
        .eq('leida', false);
      if (error) throw error;
      setData(prev => prev.map(n => ({ ...n, leida: true })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Todas las notificaciones marcadas como leídas');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudieron actualizar las notificaciones.');
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = useMemo(
    () => (notificaciones ?? []).filter(n => !n.leida).length,
    [notificaciones]
  );

  const renderItem = useCallback<ListRenderItem<any>>(({ item: notif, index }) => (
    <StaggerItem index={index} delayStep={40}>
      <PressableScale
        onPress={() => handleMarkAsRead(notif)}
        scaleValue={0.98}
        style={[
          styles.notifCard,
          notif.leida ? styles.notifRead : styles.notifUnread,
        ]}
      >
        <View style={[
          styles.iconCircle,
          { backgroundColor: notif.leida ? Colors.surface : Colors.primaryLight },
        ]}>
          <Bell
            weight={notif.leida ? 'regular' : 'fill'}
            color={notif.leida ? Colors.mutedForeground : Colors.primary}
            size={18}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.notifHeader}>
            <Text style={[
              styles.notifTitle,
              { fontWeight: notif.leida ? Typography.weights.medium : Typography.weights.bold },
            ]} numberOfLines={2}>
              {notif.titulo}
            </Text>
            {!notif.leida && <PulseDot />}
          </View>
          <Text style={styles.notifMsg} numberOfLines={2}>
            {notif.mensaje}
          </Text>
          <Text style={styles.notifDate}>
            {formatDate(notif.created_at)}
          </Text>
        </View>
      </PressableScale>
    </StaggerItem>
  ), [handleMarkAsRead]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyComponent = useMemo(() => (
    <View style={styles.empty}>
      <Bell color={Colors.mutedForeground} size={48} weight="thin" />
      <Text style={styles.emptyTitle}>Sin notificaciones</Text>
      <Text style={styles.emptyMsg}>
        Aquí aparecerán los cambios de estado de tus paquetes y viajes.
      </Text>
    </View>
  ), []);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <PageTransition>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <PressableScale
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <CaretLeft weight="bold" color={Colors.foreground} size={22} />
            </PressableScale>
            <View>
              <Text className="font-heading text-xl text-foreground" style={{ fontFamily: Typography.family }}>
                Notificaciones
              </Text>
              {unreadCount > 0 && (
                <Text style={{ fontFamily: Typography.family, fontSize: 11, color: Colors.primary, fontWeight: Typography.weights.bold, marginTop: 2 }}>
                  {unreadCount} pendientes
                </Text>
              )}
            </View>
          </View>

          {unreadCount > 0 && (
            <PressableScale
              onPress={handleMarkAllAsRead}
              disabled={markingAll}
              style={styles.iconBtn}
            >
              {markingAll ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <CheckSquare weight="bold" color={Colors.foreground} size={20} />
              )}
            </PressableScale>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={notificaciones ?? []}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={emptyComponent}
            contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
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
            maxToRenderPerBatch={15}
            windowSize={5}
            initialNumToRender={10}
          />
        )}
      </PageTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: Radius.md, // 16
    marginBottom: 12,
    ...Shadows.card,
  },
  notifRead: {
    backgroundColor: Colors.white,
    opacity: 0.8,
  },
  notifUnread: {
    backgroundColor: Colors.surface, // warm beige (#F0EFEB)
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  notifTitle: {
    fontFamily: Typography.family,
    fontSize: 14,
    color: Colors.foreground,
    flex: 1,
    lineHeight: 20,
  },
  notifMsg: {
    fontFamily: Typography.family,
    fontSize: 12,
    color: Colors.mutedForeground,
    lineHeight: 17,
    marginBottom: 6,
  },
  notifDate: {
    fontFamily: Typography.family,
    fontSize: 10,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.semibold,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  empty: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontFamily: Typography.family,
    fontSize: 18,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  emptyMsg: {
    fontFamily: Typography.family,
    fontSize: 14,
    color: Colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
});
