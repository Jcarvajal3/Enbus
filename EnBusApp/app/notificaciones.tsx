/**
 * Notificaciones (#49, M-53, M-54, APP-50): la bandeja del usuario agrupada por
 * día ("Hoy", "Ayer", "Esta semana", "Anteriores"), con icono y tono por tipo,
 * el mensaje completo y la hora relativa ("hace 5 min").
 *
 * Tocar una fila la marca como leída y, si tiene recurso (boleto, encomienda o
 * viaje), lo abre; sin recurso solo se marca como leída. Lo no leído se ve con
 * el título en negrita y un punto fijo (sin animación).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
  type SectionListRenderItem,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, CaretRight, Checks } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { useVolver } from '@/src/hooks/useVolver';
import {
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  Screen,
  ScreenHeader,
  SectionLabel,
  StaleBanner,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { formatHaceTiempo } from '@/src/utils/formatters';
import { humanizeError } from '@/src/utils/errores';
import {
  abrirRecurso,
  agruparPorDia,
  iconoNotificacion,
  type TituloGrupoDia,
  type TonoNotificacion,
} from '@/src/utils/notificaciones';
import type { Notificacion } from '@/src/types';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing, type StatusTone } from '@/src/theme';

type Seccion = { titulo: TituloGrupoDia; data: Notificacion[] };

/** Tono de la notificación → colores del sistema (`StatusPalette`). */
const TONO_PALETA: Record<TonoNotificacion, StatusTone> = {
  exito: 'success',
  info: 'progress',
  aviso: 'pending',
  peligro: 'danger',
  neutro: 'neutral',
};

const RECURSOS_QUE_ABREN = new Set(['boleto', 'encomienda', 'viaje']);

/** true si tocar la fila abre algo (lo mismo que decide `abrirRecurso`). */
function tieneRecurso(n: Notificacion): boolean {
  const tipo = (n.recurso_tipo ?? '').trim().toLowerCase();
  return !!(n.recurso_id ?? '').trim() && RECURSOS_QUE_ABREN.has(tipo);
}

export default function NotificacionesScreen() {
  const router = useRouter();
  const atras = useVolver('/(tabs)');
  const { user } = useAuth();
  const toast = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const {
    data: notificaciones,
    loading,
    error,
    setData,
    refetch,
    actualizadoAt,
    hayMas,
    cargarMas,
  } = useRealtime<Notificacion>(
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

  const secciones = useMemo<Seccion[]>(
    () => agruparPorDia(notificaciones ?? []),
    [notificaciones]
  );

  const marcarLeida = useCallback(
    async (notif: Notificacion): Promise<boolean> => {
      // Optimista: el punto y la negrita se van al tocar.
      setData((prev) => prev.map((n) => (n.id === notif.id ? { ...n, leida: true } : n)));
      const { error: err } = await supabase
        .from('notificaciones_usuario')
        .update({ leida: true })
        .eq('id', notif.id);
      if (!err) return true;
      setData((prev) => prev.map((n) => (n.id === notif.id ? { ...n, leida: false } : n)));
      return false;
    },
    [setData]
  );

  /** Un toque doble no abre el detalle dos veces (dos pantallas apiladas). */
  const abriendoRef = useRef(false);
  const handleOpen = useCallback(
    async (notif: Notificacion) => {
      if (abriendoRef.current) return;
      abriendoRef.current = true;
      try {
        const abre = tieneRecurso(notif);
        if (!notif.leida) {
          const ok = await marcarLeida(notif);
          // Con recurso se abre igual: el detalle es lo que la persona buscaba.
          if (!ok && !abre) {
            toast.show('error', 'No pudimos marcarla como leída. Revisa tu conexión e intenta de nuevo.');
            return;
          }
        }
        if (abre) await abrirRecurso(router, notif, user?.id);
      } finally {
        // La navegación ya empezó: se suelta tras la animación de entrada.
        setTimeout(() => {
          abriendoRef.current = false;
        }, 600);
      }
    },
    [marcarLeida, router, toast, user?.id]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user || unreadCount === 0 || markingAll) return;
    try {
      setMarkingAll(true);
      const { error: err } = await supabase
        .from('notificaciones_usuario')
        .update({ leida: true })
        .eq('usuario_id', user.id)
        .eq('leida', false);
      if (err) throw err;

      setData((prev) => prev.map((n) => ({ ...n, leida: true })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Marcamos todo como leído.');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No pudimos marcar todo como leído. ${humanizeError(err, 'carga')}`);
    } finally {
      setMarkingAll(false);
    }
  }, [user, unreadCount, markingAll, setData, toast]);

  const renderItem = useCallback<SectionListRenderItem<Notificacion, Seccion>>(
    ({ item, index }) => <FilaNotificacion item={item} index={index} onPress={handleOpen} />,
    [handleOpen]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Notificacion, Seccion> }) => (
      <SectionLabel style={s.seccion}>{section.titulo}</SectionLabel>
    ),
    []
  );

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        title="Notificaciones"
        subtitle={unreadCount > 0 ? `${unreadCount} sin leer` : undefined}
        onBack={atras}
        right={
          unreadCount > 0 ? (
            <IconButton
              icon={Checks}
              label="Marcar todo como leído"
              onPress={handleMarkAllAsRead}
              disabled={markingAll}
              variant="raised"
            />
          ) : null
        }
      />

      {errorCarga && sinDatos && !loading ? (
        <ErrorState
          title="No pudimos cargar tus notificaciones"
          description={errorCarga}
          onRetry={reintentar}
        />
      ) : loading && sinDatos ? (
        <ScreenSkeleton variante="lista" />
      ) : (
        <SectionList<Notificacion, Seccion>
          sections={secciones}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          onEndReached={hayMas && !error ? cargarMas : undefined}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            errorCarga ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={() => refetch()} /> : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description="Aquí verás los cambios de tus boletos y encomiendas."
            />
          }
          contentContainerStyle={scrollContent({ top: Spacing.sm })}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.accentStrong]}
              tintColor={Colors.accentStrong}
            />
          }
          maxToRenderPerBatch={15}
          windowSize={5}
          initialNumToRender={10}
        />
      )}
    </Screen>
  );
}

// ─── Fila ────────────────────────────────────────────────────────────────────

function FilaNotificacion({
  item,
  index,
  onPress,
}: {
  item: Notificacion;
  index: number;
  onPress: (n: Notificacion) => void;
}) {
  const { icon, tono } = iconoNotificacion(item);
  const abre = tieneRecurso(item);
  const hace = formatHaceTiempo(item.created_at);
  const sinLeer = !item.leida;

  const etiqueta = [sinLeer ? 'Sin leer' : null, item.titulo, item.mensaje, hace]
    .filter((p) => !!p && String(p).trim() !== '')
    .join('. ');
  const pista = abre
    ? 'Abre el detalle.'
    : sinLeer
      ? 'Toca para marcarla como leída.'
      : undefined;

  return (
    <StaggerItem index={index} delayStep={40}>
      <PressableScale
        onPress={() => onPress(item)}
        haptic
        hapticType="selection"
        scaleValue={Motion.press.card}
        style={[s.card, sinLeer ? s.cardUnread : s.cardRead]}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityHint={pista}
      >
        <IconTile
          estado={TONO_PALETA[tono]}
          icon={icon}
          style={sinLeer && tono === 'info' ? s.tileSobreCielo : undefined}
        />

        <View style={s.body}>
          <View style={s.titleRow}>
            <Text
              variant="bodyStrong"
              weight={sinLeer ? 'semibold' : 'medium'}
              numberOfLines={2}
              style={s.title}
            >
              {item.titulo}
            </Text>
            {sinLeer ? <View style={s.dot} /> : null}
          </View>

          {item.mensaje ? (
            <Text variant="secondary" color="muted" style={s.message}>
              {item.mensaje}
            </Text>
          ) : null}

          <Text variant="caption" color="muted" compact style={s.hace}>
            {hace}
          </Text>
        </View>

        {abre ? (
          <CaretRight
            size={Sizes.icon.sm}
            color={Colors.placeholder}
            weight="bold"
            style={s.chevron}
          />
        ) : null}
      </PressableScale>
    </StaggerItem>
  );
}

const s = StyleSheet.create({
  seccion: {
    marginTop: Spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
    ...Shadows.card,
  },
  cardRead: {},
  // Lo no leído se tiñe de cielo: se ve al pasar la vista, sin gritar.
  cardUnread: {
    backgroundColor: Colors.accentLight,
  },
  /** Un cuadrito azul sobre el tinte azul de lo no leído se perdería. */
  tileSobreCielo: {
    backgroundColor: Colors.background,
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
  },
  hace: {
    marginTop: Spacing.xs,
  },
  dot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentStrong,
    marginTop: Spacing.sm,
  },
  chevron: {
    alignSelf: 'center',
  },
});
