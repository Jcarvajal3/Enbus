import { SafeAreaView } from '@/tw';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, useCSSVariable } from '@/tw';
import { StyleSheet, StatusBar, Image } from 'react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { SearchForm } from '@/src/components/SearchForm';
import { Bell, UserCircle } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { PressableScale } from '@/src/components/PressableScale';
import { supabase } from '@/src/utils/supabase';
import { Colors, Typography, Radius, Gradients, Spacing } from '@/src/theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  // Fetch real name from profiles table
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
        if (data?.nombre_completo && isMounted) {
          // First name only for the greeting
          setProfileName(data.nombre_completo.trim().split(' ')[0]);
        }
      });
    return () => { isMounted = false; };
  }, [user?.id]);

  // Fallback to email prefix if profile not loaded yet
  const displayName = profileName || (user?.email ? user.email.split('@')[0] : '');

  // Notification badge — only realtime subscription on this screen
  const { data: notifNoLeidas } = useRealtime<any>(
    'notificaciones_usuario', 'usuario_id', user?.id, 'id, leida',
    { enabled: isFocused && !!user?.id, limit: 50 }
  );

  const unreadCount = useMemo(
    () => (notifNoLeidas ? notifNoLeidas.filter((n: any) => !n.leida).length : 0),
    [notifNoLeidas]
  );

  // ── Staggered entrance animations ─────────────────────────────────────────
  const greetOpacity    = useSharedValue(0);
  const greetY          = useSharedValue(22);
  const subtitleOpacity = useSharedValue(0);
  const subtitleY       = useSharedValue(22);
  const cardOpacity     = useSharedValue(0);
  const cardY           = useSharedValue(30);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    greetOpacity.value    = withTiming(1, { duration: 520, easing: ease });
    greetY.value          = withTiming(0, { duration: 520, easing: ease });
    subtitleOpacity.value = withDelay(110, withTiming(1, { duration: 500, easing: ease }));
    subtitleY.value       = withDelay(110, withTiming(0, { duration: 500, easing: ease }));
    cardOpacity.value     = withDelay(230, withTiming(1, { duration: 560, easing: ease }));
    cardY.value           = withDelay(230, withTiming(0, { duration: 560, easing: ease }));
  }, []);

  const greetStyle    = useAnimatedStyle(() => ({ opacity: greetOpacity.value,    transform: [{ translateY: greetY.value }] }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value, transform: [{ translateY: subtitleY.value }] }));
  const cardStyle     = useAnimatedStyle(() => ({ opacity: cardOpacity.value,     transform: [{ translateY: cardY.value }] }));

  // Context-aware greeting
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header bar with EnBus logo on the left and actions on the right */}
      <View style={s.header}>
        {/* Logo and App Name */}
        <View style={s.logoContainer}>
          <View style={s.logoBadge}>
            <Text style={s.logoText}>EB</Text>
          </View>
          <Text style={s.brandText}>EnBus</Text>
        </View>

        {/* Action icons */}
        <View style={s.headerActions}>
          <PressableScale onPress={() => router.push('/notificaciones')} haptic style={s.iconBtn}>
            <Bell weight="bold" size={22} color={Colors.foreground} />
            {unreadCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </PressableScale>
          <PressableScale onPress={() => router.push('/perfil')} haptic style={s.iconBtn}>
            <UserCircle weight="fill" size={26} color={Colors.foreground} />
          </PressableScale>
        </View>
      </View>

      {/* Body — containing the main brand layout card */}
      <View style={s.body}>
        <View style={s.mainCard}>
          {/* Wave gradient image from brand assets */}
          <Image
            source={require('../../assets/images/gradient-1.png')}
            style={s.waveImage}
            resizeMode="cover"
          />

          {/* Interactive Card Content */}
          <View style={s.cardContent}>
            <View>
              {/* HELLO USER! styling prefix */}
              <Animated.View style={[greetStyle, { alignItems: 'center' }]}>
                <Text style={s.prefixText}>
                  {greeting.toUpperCase()}!
                </Text>
                <Text style={s.greetingText}>
                  {displayName ? `¿Cómo te ayudamos hoy, ${displayName}?` : '¿Cómo te ayudamos hoy?'}
                </Text>
              </Animated.View>

              <Animated.View style={subtitleStyle}>
                <Text style={s.subtitleText}>
                  ¿A dónde te diriges hoy?
                </Text>
              </Animated.View>
            </View>

            {/* Search Form overlaying the gradient waves at the bottom */}
            <Animated.View style={[cardStyle, s.formWrapper]}>
              <SearchForm
                showModeToggle={true}
                onSubmit={(data) => {
                  if (data.mode === 'boletos') {
                    router.push({
                      pathname: '/boletos/resultados',
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
            </Animated.View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    zIndex: 10,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.heavy,
    color: Colors.primary,
    letterSpacing: -0.2,
  },
  brandText: {
    fontSize: 18,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    backgroundColor: Colors.secondary,
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    color: Colors.white,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.heavy,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
    justifyContent: 'flex-start',
    zIndex: 5,
  },
  mainCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    position: 'relative' as const,
  },
  waveImage: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 300,
    zIndex: 1,
  },
  cardContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.xl,
    gap: 100,
    zIndex: 2,
  },
  prefixText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
    letterSpacing: 1.5,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    marginBottom: Spacing.sm,
  },
  greetingText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes['2xl'],
    color: Colors.foreground,
    textAlign: 'center' as const,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitleText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    color: Colors.mutedForeground,
    textAlign: 'center' as const,
    marginTop: Spacing.xs,
  },
  formWrapper: {
    width: '100%',
  },
});
