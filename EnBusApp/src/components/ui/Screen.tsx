/**
 * Screen shell primitives: Screen, FloatingBar, EmptyState, ErrorState, StaleBanner.
 *
 * These encode the layout rules that screens kept re-deriving by hand: the
 * horizontal gutter, the bottom inset needed to clear the floating tab bar, and the
 * atmosphere behind the content (`Atmosfera`), so every screen breathes the same air.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowClockwise,
  ClockCounterClockwise,
  WarningCircle,
  type IconProps,
} from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Atmosfera, type AtmosferaVariante } from './Atmosfera';
import { Button, type ButtonProps } from './Button';
import { Text } from './Text';
import { Colors, Gradients, Layout, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

// ─── Screen ──────────────────────────────────────────────────────────────────

/** Alto del velo de atmósfera detrás de la cabecera de una pantalla. */
const ALTO_ATMOSFERA = 300;

export function Screen({
  children,
  background = Colors.canvas,
  edges = ['top'],
  atmosfera = 'suave',
  style,
}: {
  children: React.ReactNode;
  background?: string;
  edges?: readonly Edge[];
  /** El velo detrás de la cabecera. `null`: sin velo (la pantalla pone su propia portada). */
  atmosfera?: AtmosferaVariante | null;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView edges={edges} style={[s.screen, { backgroundColor: background }, style]}>
      {atmosfera ? <Atmosfera variante={atmosfera} style={s.velo} /> : null}
      {children}
    </SafeAreaView>
  );
}

/**
 * Encoge un formulario para que el teclado no lo tape. Envuelve el `ScrollView`;
 * la `FloatingBar` va fuera, para que el teclado la cubra mientras se escribe y
 * deje el espacio a los campos.
 *
 * Con `edgeToEdgeEnabled` Android no redimensiona la ventana al abrir el teclado:
 * hay que hacerlo aquí, y al encoger, el `ScrollView` lleva el campo enfocado a
 * la vista. En iOS eso lo hace `automaticallyAdjustKeyboardInsets` del
 * `ScrollView`. Usar con `keyboardDismissMode="on-drag"`: el teclado numérico de
 * iOS no tiene tecla para cerrarse, y cerrarlo es lo que devuelve la barra.
 */
export function EvitarTeclado({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/** Standard horizontal gutter for content that isn't inside a scroll view. */
export function Gutter({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.gutter, style]}>{children}</View>;
}

/**
 * Content padding for scrollables.
 *
 * `tabbed` reserves room for the floating tab bar; `floatingAction` reserves room
 * for a `<FloatingBar>` on top of it.
 */
export function scrollContent({
  tabbed = false,
  floatingAction = false,
  horizontal = true,
  top = Spacing.lg,
}: {
  tabbed?: boolean;
  floatingAction?: boolean;
  horizontal?: boolean;
  top?: number;
} = {}): ViewStyle {
  const base = tabbed ? Layout.scrollBottomInset : Layout.scrollBottomInsetPlain;
  const withAction = tabbed
    ? // la barra de pestañas + el botón flotante + margen para el área segura del teléfono
      Layout.floatingBarBottom + Sizes.control.lg + Spacing['5xl'] + Spacing.lg
    : // el muelle: botón + resumen + márgenes + área segura
      Sizes.control.lg + Spacing['5xl'] + Spacing['4xl'] + Spacing['2xl'];

  return {
    paddingHorizontal: horizontal ? Layout.screenPadding : 0,
    paddingTop: top,
    paddingBottom: floatingAction ? withAction : base,
  };
}

// ─── Floating action bar ─────────────────────────────────────────────────────

/**
 * La acción de la pantalla, siempre a mano. Sobre las pestañas flota encima de la
 * barra; en una pantalla apilada es un muelle blanco anclado abajo, con el resumen de
 * lo elegido ("Asiento 6 · Bs 17.822,11") justo encima del botón.
 */
export function FloatingBar({
  children,
  tabbed = false,
  fade = true,
  resumen,
}: {
  children: React.ReactNode;
  tabbed?: boolean;
  fade?: boolean;
  /** Una línea de resumen encima de la acción */
  resumen?: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[s.floatingBar, { bottom: tabbed ? Layout.floatingBarBottom + insets.bottom : 0 }]}
    >
      {fade && tabbed ? (
        <LinearGradient
          colors={[...Gradients.fadeToBackground]}
          locations={FADE_LOCATIONS}
          style={s.floatingFade}
          pointerEvents="none"
        />
      ) : null}
      <View
        style={[
          s.floatingInner,
          !tabbed && s.floatingMuelle,
          !tabbed && { paddingBottom: Spacing.xl + insets.bottom },
        ]}
      >
        {resumen ? (
          <Text
            variant="label"
            weight="semibold"
            numberOfLines={1}
            style={s.floatingResumen}
            accessibilityLiveRegion="polite"
          >
            {resumen}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** El degradado se vuelve opaco antes del botón. */
const FADE_LOCATIONS = [0, 0.45, 0.8] as const;

// ─── Empty state ─────────────────────────────────────────────────────────────

/** Acción de un `EmptyState`: un `Button md` (admite deshabilitado y carga). */
export type EmptyStateAction = Pick<
  ButtonProps,
  'children' | 'onPress' | 'variant' | 'icon' | 'disabled' | 'loading' | 'accessibilityLabel'
>;

/**
 * Every "nothing here yet" block: el icono en un sol pequeño, título y una línea, y
 * la salida debajo. `action` es la principal y `secondaryAction`, si la hay, una
 * salida `ghost` ("Revisa tu correo": "Reenviar correo" + "Usar otro correo").
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact,
}: {
  icon: React.ComponentType<IconProps>;
  title: string;
  description?: string;
  /** Optional recovery action — an empty state should offer a way forward */
  action?: EmptyStateAction;
  /** Segunda salida, `ghost` por defecto, bajo la principal. */
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
}) {
  return (
    <View style={[s.empty, compact && s.emptyCompact]}>
      <View style={[s.emptyHalo, compact && s.emptyHaloCompact]}>
        <LinearGradient colors={[...Gradients.sunSoft]} style={StyleSheet.absoluteFill} />
        <View style={[s.emptyIcon, compact && s.emptyIconCompact]}>
          <Icon
            size={compact ? Sizes.icon.lg : Sizes.icon['2xl']}
            color={Colors.primaryDeep}
            weight="duotone"
          />
        </View>
      </View>
      <Text variant={compact ? 'subheading' : 'heading'} align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="muted" align="center" style={s.emptyDescription}>
          {description}
        </Text>
      ) : null}
      {action || secondaryAction ? (
        <View style={s.emptyActions}>
          {action ? <Button size="md" {...action} variant={action.variant ?? 'primary'} /> : null}
          {secondaryAction ? (
            <Button size="md" {...secondaryAction} variant={secondaryAction.variant ?? 'ghost'} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

/**
 * Lo que se muestra cuando una carga falla y no hay nada que enseñar. El botón
 * "Reintentar" muestra carga mientras corre `onRetry`, así el usuario sabe que su
 * toque hizo algo. `description` suele ser `humanizeError(err, …)`.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  compact,
}: {
  title: string;
  description?: string;
  onRetry: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Ref además del estado: dos toques seguidos llegan antes del re-render.
  const enCurso = useRef(false);

  const handleRetry = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // `onRetry` muestra su propio error (la pantalla vuelve a este estado).
    } finally {
      enCurso.current = false;
      if (mounted.current) setRetrying(false);
    }
  }, [onRetry]);

  return (
    <View
      style={[s.empty, compact && s.emptyCompact]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[s.emptyHalo, s.errorHalo, compact && s.emptyHaloCompact]}>
        <View style={[s.emptyIcon, compact && s.emptyIconCompact]}>
          <WarningCircle
            size={compact ? Sizes.icon.lg : Sizes.icon['2xl']}
            color={Colors.destructive}
            weight="duotone"
          />
        </View>
      </View>
      <Text variant={compact ? 'subheading' : 'heading'} align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="muted" align="center" style={s.emptyDescription}>
          {description}
        </Text>
      ) : null}
      <View style={s.emptyActions}>
        <Button
          size="md"
          variant="secondary"
          icon={ArrowClockwise}
          loading={retrying}
          onPress={handleRetry}
          accessibilityLabel={retrying ? 'Reintentando' : 'Reintentar'}
        >
          Reintentar
        </Button>
      </View>
    </View>
  );
}

// ─── Stale banner ────────────────────────────────────────────────────────────

/** "hace 5 min", "hace 2 h", "hace 3 días"; `null` si no hay fecha. */
function haceCuanto(ms: number | null | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  const minutos = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/**
 * Aviso de que la lista muestra datos guardados porque la carga falló.
 * Va encima del contenido en caché; `onRetry` añade el enlace "Reintentar".
 */
export function StaleBanner({
  actualizadoAt,
  onRetry,
}: {
  /** `Date.now()` de la última carga buena */
  actualizadoAt?: number | null;
  onRetry?: () => void;
}) {
  const hace = haceCuanto(actualizadoAt);
  const texto = hace
    ? `Mostrando datos guardados · actualizado ${hace}`
    : 'Mostrando datos guardados';

  return (
    <View style={s.stale} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <ClockCounterClockwise size={Sizes.icon.sm} color={Colors.warningText} weight="bold" />
      <Text variant="caption" weight="medium" color="warningText" style={s.staleText}>
        {texto}
      </Text>
      {onRetry ? (
        <PressableScale
          onPress={onRetry}
          haptic
          hapticType="selection"
          style={s.staleActionBox}
          accessibilityRole="button"
          accessibilityLabel="Reintentar la carga"
        >
          <Text variant="caption" weight="bold" color="warningText">
            Reintentar
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  velo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ALTO_ATMOSFERA,
  },
  gutter: {
    paddingHorizontal: Layout.screenPadding,
  },
  floatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  floatingFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -Spacing['5xl'],
    top: -Spacing['3xl'],
  },
  floatingInner: {
    paddingHorizontal: Layout.screenPadding,
  },
  floatingMuelle: {
    paddingTop: Spacing.lg,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderCurve: 'continuous',
    ...Shadows.dock,
  },
  floatingResumen: {
    marginBottom: Spacing.md,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyCompact: {
    paddingVertical: Spacing['3xl'],
  },
  emptyHalo: {
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  emptyHaloCompact: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    marginBottom: Spacing.lg,
  },
  emptyIcon: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  emptyIconCompact: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
  },
  errorHalo: {
    backgroundColor: Colors.destructiveLight,
  },
  emptyDescription: {
    marginTop: Spacing.sm,
    maxWidth: 300,
  },
  emptyActions: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningLight,
    marginBottom: Spacing.md,
  },
  staleText: {
    flex: 1,
  },
  /** Área táctil cómoda alrededor de un enlace de texto pequeño */
  staleActionBox: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
});
