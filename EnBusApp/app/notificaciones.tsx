import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, CheckSquare } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { PageTransition } from '@/src/components/PageTransition';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  StaleBanner,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { formatDate } from '@/src/utils/formatters';
import { humanizeError } from '@/src/utils/errores';
import type { Notificacion } from '@/src/types';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export default function NotificacionesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const { data: notificaciones, loading, error, setData, refetch, actualizadoAt } = useRealtime<Notificacion>(
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

  /** "Reintentar" de `ErrorState`: `refetch` se resuelve cuando termina la recarga. */
  const reintentar = useCallback(() => refetch(), [refetch]);

  /** Mensaje para el usuario del último fallo de carga (APP-37). */
  const errorCarga = error ? humanizeError(error, 'carga') : null;
  const sinDatos = (notificaciones ?? []).length === 0;

  const unreadCount = useMemo(
    () => (notificaciones ?? []).filter((n) => !n.leida).length,
    [notificaciones]
  );

  const navigateToResource = useCallback(
    async (notif: Notificacion) => {
      if (!notif.recurso_tipo || !notif.recurso_id) return;

      if (notif.recurso_tipo === 'boleto') {
        router.push({ pathname: '/boletos/[id]', params: { id: notif.recurso_id } });
        return;
      }

      // Encomiendas resolve to a different screen depending on which side of the
      // shipment the user is on.
      try {
        const { data, error } = await supabase
          .from('encomiendas')
          .select('sender_id')
          .eq('id', notif.recurso_id)
          .single();
        if (error) throw error;

        router.push({
          pathname:
            data.sender_id === user?.id
              ? '/encomiendas/enviar/[id]'
              : '/encomiendas/recibir/[id]',
          params: { id: notif.recurso_id },
        });
      } catch {
        router.push({ pathname: '/encomiendas/enviar/[id]', params: { id: notif.recurso_id } });
      }
    },
    [router, user?.id]
  );

  const handleOpen = useCallback(
    async (notif: Notificacion) => {
      if (!notif.leida) {
        // Optimistic: the row should stop pulsing the moment it's tapped.
        setData((prev) => prev.map((n) => (n.id === notif.id ? { ...n, leida: true } : n)));
        const { error } = await supabase
          .from('notificaciones_usuario')
          .update({ leida: true })
          .eq('id', notif.id);
        if (error) {
          // No bloquea: se abre el detalle igual y la notificación queda sin leer.
          setData((prev) => prev.map((n) => (n.id === notif.id ? { ...n, leida: false } : n)));
          if (__DEV__) console.warn('[notificaciones] No se pudo marcar como leída:', error.message);
        }
      }
      navigateToResource(notif);
    },
    [navigateToResource, setData]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user || unreadCount === 0) return;
    try {
      setMarkingAll(true);
      const { error } = await supabase
        .from('notificaciones_usuario')
        .update({ leida: true })
        .eq('usuario_id', user.id)
        .eq('leida', false);
      if (error) throw error;

      setData((prev) => prev.map((n) => ({ ...n, leida: true })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Todas las notificaciones marcadas como leídas');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(
        'error',
        `No pudimos marcar las notificaciones como leídas. ${humanizeError(err, 'carga')}`
      );
    } finally {
      setMarkingAll(false);
    }
  }, [user, unreadCount, setData, toast]);

  const renderItem = useCallback<ListRenderItem<Notificacion>>(
    ({ item, index }) => (
      <StaggerItem index={index} delayStep={40}>
        <PressableScale
          onPress={() => handleOpen(item)}
          haptic
          hapticType="selection"
          scaleValue={Motion.press.card}
          style={[s.card, item.leida ? s.cardRead : s.cardUnread]}
          accessibilityRole="button"
          accessibilityLabel={`${item.leida ? 'Leída' : 'Sin leer'}. ${item.titulo}. ${item.mensaje ?? ''}`}
        >
          <View
            style={[
              s.icon,
              { backgroundColor: item.leida ? Colors.surface : Colors.primaryLight },
            ]}
          >
            <Bell
              weight={item.leida ? 'regular' : 'fill'}
              color={item.leida ? Colors.mutedForeground : Colors.primary}
              size={Sizes.icon.md}
            />
          </View>

          <View style={s.body}>
            <View style={s.titleRow}>
              <Text
                variant="bodyStrong"
                size="sm"
                weight={item.leida ? 'medium' : 'bold'}
                numberOfLines={2}
                style={s.title}
              >
                {item.titulo}
              </Text>
              {!item.leida && <PulseDot />}
            </View>

            {item.mensaje ? (
              <Text variant="caption" color="muted" numberOfLines={2} style={s.message}>
                {item.mensaje}
              </Text>
            ) : null}

            <Text variant="caption" size="xs" color="muted" weight="semibold" compact>
              {formatDate(item.created_at)}
            </Text>
          </View>
        </PressableScale>
      </StaggerItem>
    ),
    [handleOpen]
  );

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          title="Notificaciones"
          subtitle={unreadCount > 0 ? `${unreadCount} sin leer` : undefined}
          onBack={() => router.back()}
          right={
            unreadCount > 0 ? (
              <IconButton
                icon={CheckSquare}
                label="Marcar todas como leídas"
                onPress={handleMarkAllAsRead}
                disabled={markingAll}
              />
            ) : undefined
          }
        />

        {errorCarga && sinDatos && !loading ? (
          <ErrorState
            title="No pudimos cargar tus notificaciones"
            description={errorCarga}
            onRetry={reintentar}
          />
        ) : loading && sinDatos ? (
          <LoadingState label="Cargando notificaciones…" />
        ) : (
          <FlatList
            data={notificaciones ?? []}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              errorCarga ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={() => refetch()} /> : null
            }
            ListEmptyComponent={
              <EmptyState
                icon={Bell}
                title="Sin notificaciones"
                description="Aquí aparecerán los cambios de tus boletos y encomiendas."
              />
            }
            contentContainerStyle={scrollContent()}
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
            maxToRenderPerBatch={15}
            windowSize={5}
            initialNumToRender={10}
          />
        )}
      </PageTransition>
    </Screen>
  );
}

/** Pulsing dot marking an unread item. */
function PulseDot() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Motion.easing.inOut }),
        withTiming(0, { duration: 600, easing: Motion.easing.inOut })
      ),
      -1,
      false
    );
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.4 }],
    opacity: 1 - progress.value * 0.6,
  }));

  return <Animated.View style={[s.dot, animStyle]} />;
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    ...Shadows.subtle,
  },
  cardRead: {
    backgroundColor: Colors.white,
    borderWidth: Sizes.hairline,
    borderColor: Colors.borderLight,
  },
  cardUnread: {
    backgroundColor: Colors.surface,
  },
  icon: {
    width: Sizes.avatar.sm,
    height: Sizes.avatar.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
  },
  message: {
    marginTop: Spacing.xs / 2,
    marginBottom: Spacing.xs + 2,
  },
  dot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    marginTop: Spacing.xs + 2,
  },
});
