import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, CaretRight, Package, Ticket, UserCircle } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useActivity } from '@/src/contexts/ActivityContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { SearchForm } from '@/src/components/SearchForm';
import { StaggerItem } from '@/src/components/StaggerItem';
import { PressableScale } from '@/src/components/PressableScale';
import { IconButton, Screen, Text } from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { nombreValido } from '@/src/utils/validation';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { boletosActivos, encomiendasActivas } = useActivity();

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  // ── Nombre real para el saludo ─────────────────────────────────────────────
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;
    supabase
      .from('profiles')
      .select('nombre_completo')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        // Sin el relleno "Usuario EnBus" del alta con Google.
        if (data?.nombre_completo && nombreValido(data.nombre_completo) && isMounted) {
          setProfileName(data.nombre_completo.trim().split(' ')[0]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const displayName = profileName || (user?.email ? user.email.split('@')[0] : '');

  // ── Badge de notificaciones ────────────────────────────────────────────────
  const { data: notificaciones } = useRealtime<{ id: string; leida: boolean }>(
    'notificaciones_usuario',
    'usuario_id',
    user?.id,
    'id, leida',
    { enabled: isFocused && !!user?.id, limit: 50 }
  );

  const unreadCount = useMemo(
    () => (notificaciones ?? []).filter((n) => !n.leida).length,
    [notificaciones]
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  return (
    <Screen>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={s.header}>
        <View style={s.brand}>
          <View style={s.logoBadge}>
            <Text variant="overline" size="sm" weight="heavy" color="foreground" compact>
              EB
            </Text>
          </View>
          <Text variant="subheading" weight="heavy" compact>
            EnBus
          </Text>
        </View>

        <View style={s.headerActions}>
          <IconButton
            icon={Bell}
            label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
            badgeCount={unreadCount}
            onPress={() => router.push('/notificaciones')}
          />
          <IconButton
            icon={UserCircle}
            iconWeight="fill"
            label="Mi perfil"
            onPress={() => router.push('/perfil')}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero: saludo + buscador ─────────────────────────────────────── */}
        <View style={s.hero}>
          <Image
            source={require('../../assets/images/gradient-1.png')}
            style={s.heroWave}
            resizeMode="cover"
          />

          <View style={s.heroContent}>
            <StaggerItem index={0} delayStep={110} translateYStart={22}>
              <Text variant="overline" color="muted" uppercase align="center">
                {greeting}
              </Text>
              <Text variant="title" size="2xl" align="center" style={s.heroTitle}>
                {displayName ? `¿A dónde vamos, ${displayName}?` : '¿A dónde vamos hoy?'}
              </Text>
            </StaggerItem>

            <StaggerItem index={1} delayStep={110} translateYStart={22} style={s.heroSubtitleSlot}>
              <Text variant="secondary" color="muted" align="center">
                Compra tu boleto o envía una encomienda desde tu teléfono.
              </Text>
            </StaggerItem>

            <StaggerItem index={2} delayStep={110} translateYStart={28}>
              <SearchForm
                showModeToggle
                onSubmit={(data) => {
                  if (data.mode === 'boletos') {
                    router.push({
                      pathname: '/boletos/buscar',
                      params: {
                        origen: data.origen.ciudad,
                        destino: data.destino.ciudad,
                        fecha: data.fecha ?? '',
                      },
                    });
                  } else {
                    router.push({
                      pathname: '/encomiendas/nueva',
                      params: {
                        origen_ciudad: data.origen.ciudad,
                        origen_estado: data.origen.estado,
                        destino_ciudad: data.destino.ciudad,
                        destino_estado: data.destino.estado,
                      },
                    });
                  }
                }}
              />
            </StaggerItem>
          </View>
        </View>

        {/* ── Actividad en curso ──────────────────────────────────────────── */}
        <StaggerItem index={3} delayStep={110} style={s.activity}>
          <Text variant="overline" color="muted" uppercase style={s.activityLabel}>
            Tu actividad
          </Text>
          <View style={s.activityRow}>
            <ActivityTile
              icon={Ticket}
              count={boletosActivos}
              label="Boletos activos"
              empty="Sin boletos activos"
              tint={Colors.accent}
              tintBackground={Colors.accentLight}
              onPress={() => router.push('/(tabs)/boletos')}
            />
            <ActivityTile
              icon={Package}
              count={encomiendasActivas}
              label="Encomiendas activas"
              empty="Sin encomiendas activas"
              tint={Colors.secondary}
              tintBackground={Colors.secondaryLight}
              onPress={() => router.push('/(tabs)/encomiendas')}
            />
          </View>
        </StaggerItem>
      </ScrollView>
    </Screen>
  );
}

// ─── Activity tile ───────────────────────────────────────────────────────────

/**
 * Compact entry point to an in-flight list. Home used to be a search form and
 * nothing else — there was no way to reach an active trip without switching
 * tabs first.
 */
function ActivityTile({
  icon: Icon,
  count,
  label,
  empty,
  tint,
  tintBackground,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; weight?: 'fill' | 'bold' }>;
  count: number;
  label: string;
  empty: string;
  tint: string;
  tintBackground: string;
  onPress: () => void;
}) {
  const hasItems = count > 0;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.tile}
      accessibilityRole="button"
      accessibilityLabel={hasItems ? `${count} ${label}` : `${label}. ${empty}`}
    >
      <View style={s.tileTop}>
        <View style={[s.tileIcon, { backgroundColor: tintBackground }]}>
          <Icon size={Sizes.icon.md} color={tint} weight="fill" />
        </View>
        <CaretRight size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
      </View>

      {/* El número va en `foreground`: el coral y el azul claros no llegan a 3:1 sobre beige. */}
      {hasItems ? (
        <Text variant="title" size="3xl" color="foreground" compact style={s.tileCount}>
          {String(count)}
        </Text>
      ) : (
        <Text variant="title" size="3xl" color="muted" compact style={s.tileCount}>
          0
        </Text>
      )}

      <Text variant="caption" color="muted" numberOfLines={2}>
        {hasItems ? label : empty}
      </Text>
    </PressableScale>
  );
}

const HERO_SPACER = Spacing['5xl'] * 2;

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingCompact + Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    zIndex: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoBadge: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  scroll: {
    paddingHorizontal: Layout.screenPaddingCompact,
    paddingTop: Spacing.md,
    paddingBottom: Layout.scrollBottomInset,
  },

  hero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    ...Shadows.card,
  },
  heroWave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 300,
  },
  heroContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.xl,
    // Pushes the search form down so it sits over the crest of the wave.
    gap: HERO_SPACER,
  },
  heroTitle: {
    marginTop: Spacing.sm,
  },
  /** Sits directly under the title, so it cancels the hero's large gap. */
  heroSubtitleSlot: {
    marginTop: -HERO_SPACER + Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },

  activity: {
    marginTop: Spacing['2xl'],
  },
  activityLabel: {
    marginBottom: Spacing.md,
    marginLeft: Spacing.xs,
  },
  activityRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  tileIcon: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCount: {
    marginBottom: Spacing.xs,
  },
});
