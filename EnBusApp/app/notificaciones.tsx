import { SafeAreaView, View, Text, Pressable, useCSSVariable, ScrollView } from '@/tw';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { CaretLeft, Bell, CheckSquare } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { formatDate } from '@/src/utils/formatters';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';

export default function NotificacionesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const mutedColor = useCSSVariable('--muted-foreground') as string || '#737373';
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';
  const primaryColor = useCSSVariable('--primary') as string || '#e2b714';

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
      
      // La suscripción Realtime actualizará el estado local de forma automática.
      // Pero hacemos navegación inmediata por UX.
      handleNavigate(notif);
    } catch (err: any) {
      console.error('Error marking notification as read:', err.message);
    }
  };

  const handleNavigate = async (notif: any) => {
    if (!notif.recurso_tipo || !notif.recurso_id) return;

    if (notif.recurso_tipo === 'boleto') {
      router.push({
        pathname: '/boletos/[id]',
        params: { id: notif.recurso_id }
      });
    } else if (notif.recurso_tipo === 'encomienda') {
      try {
        // Consultar quién es el remitente para dirigir al flujo correcto
        const { data, error } = await supabase
          .from('encomiendas')
          .select('sender_id')
          .eq('id', notif.recurso_id)
          .single();
        
        if (error) throw error;
        
        if (data.sender_id === user?.id) {
          router.push({
            pathname: '/encomiendas/enviar/[id]',
            params: { id: notif.recurso_id }
          });
        } else {
          router.push({
            pathname: '/encomiendas/recibir/[id]',
            params: { id: notif.recurso_id }
          });
        }
      } catch (err) {
        console.error('Error determining package route:', err);
        // Fallback genérico a enviar si falla
        router.push({
          pathname: '/encomiendas/enviar/[id]',
          params: { id: notif.recurso_id }
        });
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

      // Actualizar localmente de forma inmediata por UX
      setData(prev => prev.map(n => ({ ...n, leida: true })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Todas las notificaciones marcadas como leídas');
    } catch (err: any) {
      console.error('Error marking all as read:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudieron actualizar las notificaciones.');
    } finally {
      setMarkingAll(false);
    }
  };

  // PERF-02: Memoize unread count — avoids recomputing on every render.
  const unreadCount = useMemo(
    () => (notificaciones ?? []).filter(n => !n.leida).length,
    [notificaciones]
  );

  // PERF-01: Memoize renderItem for stable FlatList row references.
  const renderItem = useCallback<ListRenderItem<any>>(({ item: notif }) => (
    <Pressable
      key={notif.id}
      onPress={() => handleMarkAsRead(notif)}
      className={`p-4 rounded-[14px] border flex-row items-start gap-3 bg-card mb-3 ${notif.leida ? 'border-border/50 opacity-75' : 'border-primary bg-primary/5 shadow-sm'}`}
    >
      <View className={`size-10 rounded-full items-center justify-center mt-0.5 ${notif.leida ? 'bg-secondary' : 'bg-primary/20'}`}>
        <Bell weight={notif.leida ? 'regular' : 'fill'} color={notif.leida ? mutedColor : primaryColor} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between items-start gap-1">
          <Text className={`text-sm text-foreground flex-1 leading-5 ${notif.leida ? 'font-medium' : 'font-bold'}`}>
            {notif.titulo}
          </Text>
          {!notif.leida && (
            <View className="size-2 rounded-full bg-primary mt-1.5" />
          )}
        </View>
        <Text className="text-xs text-muted-foreground mt-1 leading-4">
          {notif.mensaje}
        </Text>
        <Text className="text-[10px] text-muted-foreground/80 mt-2 font-semibold">
          {formatDate(notif.created_at)}
        </Text>
      </View>
    </Pressable>
  ), [mutedColor, primaryColor, handleMarkAsRead]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyComponent = useMemo(() => (
    <View className="py-20 items-center justify-center gap-3">
      <Bell color={mutedColor} size={48} weight="thin" />
      <Text className="text-lg font-bold text-foreground">Sin notificaciones</Text>
      <Text className="text-sm text-muted-foreground text-center leading-[22px] px-6">
        Aquí aparecerán los cambios de estado de tus paquetes y viajes.
      </Text>
    </View>
  ), [mutedColor]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-4 pb-4 bg-background flex-row justify-between items-center border-b border-border">
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => router.back()}
            className="size-10 bg-secondary rounded-full items-center justify-center"
          >
            <CaretLeft weight="bold" color={foregroundColor} size={22} />
          </Pressable>
          <View>
            <Text className="font-heading text-xl text-foreground">Notificaciones</Text>
            {unreadCount > 0 && (
              <Text className="text-xs text-primary font-bold mt-0.5">{unreadCount} pendientes</Text>
            )}
          </View>
        </View>

        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllAsRead}
            disabled={markingAll}
            className="size-10 bg-secondary rounded-full items-center justify-center"
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <CheckSquare weight="bold" color={foregroundColor} size={20} />
            )}
          </Pressable>
        )}
      </View>

      {/* PERF-01: FlatList replaces ScrollView + .map() */}
      {loading ? (
        <View className="py-20 items-center">
          <ActivityIndicator size="large" color={primaryColor} />
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
              colors={[primaryColor]}
              tintColor={primaryColor}
            />
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          windowSize={5}
          initialNumToRender={10}
        />
      )}
    </SafeAreaView>
  );
}
