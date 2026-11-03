/**
 * Screen shell primitives: Screen, FloatingBar, EmptyState, ErrorState,
 * StaleBanner.
 *
 * These encode the layout rules that screens kept re-deriving by hand:
 * the horizontal gutter, and — critically — the bottom inset needed to clear
 * the floating tab bar. Lists used to hardcode `paddingBottom: 128` and FABs
 * `bottom: 110`; both now come from `Layout`, so moving the tab bar moves
 * everything with it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowClockwise,
  ClockCounterClockwise,
  WarningCircle,
  type IconProps,
} from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Button, type ButtonProps } from './Button';
import { Text } from './Text';
import { Colors, Gradients, Layout, Radius, Sizes, Spacing } from '@/src/theme';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function Screen({
  children,
  background = Colors.background,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  background?: string;
  edges?: readonly Edge[];
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView edges={edges} style={[s.screen, { backgroundColor: background }, style]}>
      {children}
    </SafeAreaView>
  );
}

/** Standard horizontal gutter for content that isn't inside a scroll view. */
export function Gutter({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.gutter, style]}>{children}</View>;
}

/**
 * Content padding for scrollables.
 *
 * `tabbed` reserves room for the floating tab bar; `floatingAction` reserves
 * room for a `<FloatingBar>` on top of it. Screens used to hardcode
 * `paddingBottom: 128` regardless of whether a FAB was present, so the last
 * card sat underneath it.
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
    ? Layout.floatingBarBottom + Sizes.control.lg + Spacing.lg
    : // botón + márgenes de la barra + la línea de resumen (si la hay)
      Sizes.control.lg + Spacing['4xl'] + Spacing['3xl'];

  return {
    paddingHorizontal: horizontal ? Layout.screenPadding : 0,
    paddingTop: top,
    paddingBottom: floatingAction ? withAction : base,
  };
}

// ─── Floating action bar ─────────────────────────────────────────────────────

/**
 * Pinned bottom action area. On tabbed screens it floats above the tab bar; on
 * stacked screens it sits on the bottom edge (over the safe area) with a fade so
 * content scrolling underneath doesn't collide with the button.
 *
 * `resumen`: una línea sobre el botón con lo elegido en el paso
 * ("Asiento 6 · Bs 17.822,11"), §2.1 regla 6.
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
      style={[s.floatingBar, { bottom: tabbed ? Layout.floatingBarBottom : 0 }]}
    >
      {fade && !tabbed && (
        <LinearGradient
          colors={[...Gradients.fadeToBackground]}
          locations={FADE_LOCATIONS}
          style={s.floatingFade}
          pointerEvents="none"
        />
      )}
      <View
        style={[
          s.floatingInner,
          !tabbed && s.floatingInnerPlain,
          !tabbed && { paddingBottom: Spacing['2xl'] + insets.bottom },
        ]}
      >
        {resumen ? (
          <Text
            variant="label"
            align="center"
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

/** El degradado se vuelve opaco antes del texto del resumen y del botón. */
const FADE_LOCATIONS = [0, 0.3, 0.45] as const;

// ─── Empty state ─────────────────────────────────────────────────────────────

/**
 * Every "nothing here yet" block. Previously five copies with icon circles of
 * 64 or 96pt and titles between 16 and 20pt.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: React.ComponentType<IconProps>;
  title: string;
  description?: string;
  /** Optional recovery action — an empty state should offer a way forward */
  action?: Pick<ButtonProps, 'children' | 'onPress' | 'variant' | 'icon'>;
  compact?: boolean;
}) {
  return (
    <View style={[s.empty, compact && s.emptyCompact]}>
      <View style={[s.emptyIcon, compact && s.emptyIconCompact]}>
        <Icon
          size={compact ? Sizes.icon.xl : Sizes.icon['2xl']}
          color={Colors.mutedForeground}
          weight="regular"
        />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="secondary" color="muted" align="center" style={s.emptyDescription}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={s.emptyAction}>
          <Button size="md" {...action} variant={action.variant ?? 'primary'} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

/**
 * Lo que se muestra cuando una carga falla y no hay nada que enseñar (DS-08).
 * El botón "Reintentar" muestra carga mientras corre `onRetry`, así el usuario
 * sabe que su toque hizo algo (antes "Intentar de nuevo" no daba señal).
 * `description` suele ser `humanizeError(err, …)`.
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
      <View style={[s.emptyIcon, s.errorIcon, compact && s.emptyIconCompact]}>
        <WarningCircle
          size={compact ? Sizes.icon.xl : Sizes.icon['2xl']}
          color={Colors.dangerText}
          weight="regular"
        />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="secondary" color="muted" align="center" style={s.emptyDescription}>
          {description}
        </Text>
      ) : null}
      <View style={s.emptyAction}>
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
      <Text variant="caption" color="warningText" style={s.staleText}>
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
          <Text variant="caption" weight="bold" color="warningText" style={s.staleAction}>
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
    bottom: 0,
    top: -Spacing['3xl'],
  },
  floatingInner: {
    paddingHorizontal: Layout.screenPadding,
  },
  floatingInnerPlain: {
    paddingTop: Spacing.lg,
  },
  floatingResumen: {
    marginBottom: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'] + Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyCompact: {
    paddingVertical: Spacing['4xl'],
  },
  emptyIcon: {
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  emptyIconCompact: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    marginBottom: Spacing.lg,
  },
  emptyDescription: {
    marginTop: Spacing.sm,
    maxWidth: 300,
  },
  emptyAction: {
    marginTop: Spacing.xl,
  },
  errorIcon: {
    backgroundColor: Colors.destructiveLight,
  },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warningLight,
    marginBottom: Spacing.md,
  },
  staleText: {
    flex: 1,
  },
  staleAction: {
    textDecorationLine: 'underline',
  },
  /** Área táctil cómoda alrededor de un enlace de texto pequeño */
  staleActionBox: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
});
