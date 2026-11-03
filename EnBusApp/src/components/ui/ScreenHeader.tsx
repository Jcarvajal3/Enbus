/**
 * ScreenHeader — one header for every screen.
 *
 *   <ScreenHeader title="Mis boletos" right={<HeaderActions />} />                       // pestaña
 *   <ScreenHeader variant="compact" eyebrow="Boleto" title="BOL-7CAB-E4AD"
 *     status={<StatusBadge dominio="boleto" estado={…} />} onBack={volver} />           // detalle
 *   <ScreenHeader variant="steps" title="Elige tu asiento" step={2} totalSteps={4} onBack={…} />
 *
 * Reglas (§2.1): pestaña = `large` con título y acciones, sin subtítulo.
 * Detalle = `compact`: ←, ceja (nombre del objeto, una línea), título (el
 * código, nunca recortado: encoge hasta 85 % antes que cortarse) y el estado en
 * `status`, una fila bajo el título. `right` solo para `IconButton`.
 * Asistente = `steps`: "Paso 2 de 4" + título del paso.
 */
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { ArrowLeft } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { Colors, Layout, Motion, Radius, Sizes, Spacing, Typography } from '@/src/theme';

export type ScreenHeaderVariant = 'large' | 'compact' | 'steps';

export interface ScreenHeaderProps {
  /**
   * Texto del título. En `large` también admite un elemento: Inicio pone
   * `<BrandMark conNombre />` (AN-22) y conserva la altura y el margen de las
   * demás pestañas, así la campana y el avatar no se mueven.
   */
  title: string | React.ReactElement;
  /** Se conserva, pero las pestañas no llevan subtítulo (§2.1). */
  subtitle?: string;
  /** Línea corta sobre el título (nombre del objeto en un detalle) */
  eyebrow?: string;
  variant?: ScreenHeaderVariant;
  onBack?: () => void;
  backLabel?: string;
  /** Acciones de icono a la derecha (`IconButton`) */
  right?: React.ReactNode;
  /** Estado del objeto (p. ej. `<StatusBadge />`): fila bajo el título (`compact`) */
  status?: React.ReactNode;
  /** `steps` variant only */
  step?: number;
  totalSteps?: number;
  /** Hairline under the header — on by default for `compact` */
  divided?: boolean;
}

/** El título encoge hasta este factor antes de recortarse (códigos BOL-… / EB-…). */
const TITULO_ESCALA_MINIMA = 0.85;

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  variant = 'large',
  onBack,
  backLabel = 'Atrás',
  right,
  status,
  step = 1,
  totalSteps = 1,
  divided,
}: ScreenHeaderProps) {
  const showDivider = divided ?? variant === 'compact';

  if (variant === 'steps') {
    return (
      <View style={[s.container, showDivider && s.divided]}>
        <View style={s.row}>
          {onBack ? (
            <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} />
          ) : (
            <View style={s.backSpacer} />
          )}
          <StepIndicator step={step} totalSteps={totalSteps} />
        </View>
        {typeof title === 'string' ? (
          <Text variant="heading" align="center" style={s.stepTitle} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text variant="secondary" color="muted" align="center" style={s.stepSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  if (variant === 'compact') {
    return (
      <View style={[s.container, showDivider && s.divided]}>
        <View style={s.compactRow}>
          <View style={s.compactLeft}>
            {onBack && <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} />}
            <View style={s.compactTitles}>
              {eyebrow ? (
                <Text variant="caption" weight="semibold" color="muted" numberOfLines={1} compact>
                  {eyebrow}
                </Text>
              ) : null}
              {typeof title === 'string' ? (
                <Text
                  variant="heading"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={TITULO_ESCALA_MINIMA}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              ) : (
                title
              )}
              {subtitle ? (
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {right ? <View style={s.rightGroup}>{right}</View> : null}
        </View>
        {status ? <View style={[s.status, onBack ? s.statusConFlecha : null]}>{status}</View> : null}
      </View>
    );
  }

  return (
    <View style={[s.container, showDivider && s.divided]}>
      <View style={s.largeRow}>
        <View style={s.largeTitles}>
          {eyebrow ? (
            <Text variant="caption" weight="semibold" color="muted" numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          {typeof title === 'string' ? <TituloPestana>{title}</TituloPestana> : title}
        </View>
        {right ? <View style={s.rightGroup}>{right}</View> : null}
      </View>
      {subtitle ? (
        <Text variant="secondary" color="muted" style={s.largeSubtitle}>
          {subtitle}
        </Text>
      ) : null}
      {status ? <View style={s.status}>{status}</View> : null}
    </View>
  );
}

// ─── Título de pestaña ───────────────────────────────────────────────────────

/** "Mis encomiendas" encoge hasta este factor antes que partirse (360 pt). */
const PESTANA_ESCALA_MINIMA = 0.8;
/** Ancho holgado de la copia de medida (el título nunca llega a tanto). */
const MEDIDA_ANCHO = 1000;

/**
 * Título de pestaña en una sola línea: mide su ancho natural con una copia
 * invisible y, si no cabe junto a las acciones, reduce el cuerpo (en web
 * `adjustsFontSizeToFit` no existe, por eso se mide).
 */
function TituloPestana({ children }: { children: string }) {
  const [disponible, setDisponible] = useState(0);
  const [natural, setNatural] = useState(0);
  const escala =
    disponible > 0 && natural > disponible
      ? Math.max(PESTANA_ESCALA_MINIMA, disponible / natural)
      : 1;
  const base = Typography.sizes[Typography.presets.title.size];
  const alto = Typography.lineHeights[Typography.presets.title.size];
  const ajuste = escala < 1 ? { fontSize: base * escala, lineHeight: alto * escala } : null;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setDisponible(e.nativeEvent.layout.width)}>
      <Text
        variant="title"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={PESTANA_ESCALA_MINIMA}
        accessibilityRole="header"
        style={ajuste}
      >
        {children}
      </Text>
      <View
        style={s.medida}
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          variant="title"
          numberOfLines={1}
          style={s.medidaTexto}
          onLayout={(e: LayoutChangeEvent) => setNatural(e.nativeEvent.layout.width)}
        >
          {children}
        </Text>
      </View>
    </View>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────

/** Progreso de un asistente: puntos + "Paso 2 de 4" (D22, AU-42). */
export function StepIndicator({ step, totalSteps }: { step: number; totalSteps: number }) {
  const texto = `Paso ${step} de ${totalSteps}`;
  return (
    <View
      style={s.stepper}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={texto}
      accessibilityValue={{ now: step, min: 1, max: totalSteps }}
    >
      <View style={s.stepDots}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <StepDot key={i} active={i + 1 === step} done={i + 1 < step} />
        ))}
      </View>
      <Text variant="label" compact>
        {texto}
      </Text>
    </View>
  );
}

const DOT_SIZE = Spacing.sm;
const PILL_WIDTH = Spacing['3xl'];

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(active ? PILL_WIDTH : DOT_SIZE);

  React.useEffect(() => {
    const destino = active ? PILL_WIDTH : DOT_SIZE;
    width.value = reduceMotion
      ? destino
      : withTiming(destino, { duration: Motion.duration.base, easing: Motion.easing.out });
  }, [active, width, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[
        s.stepDot,
        animated,
        { backgroundColor: active || done ? Colors.foreground : Colors.border },
      ]}
    />
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Layout.headerPaddingTop,
    paddingBottom: Layout.headerPaddingBottom,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  divided: {
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backSpacer: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  /** Alinea el estado con el título, no con la flecha. */
  statusConFlecha: {
    marginLeft: Sizes.touchTarget + Spacing.md,
  },

  // large
  largeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    minHeight: Sizes.touchTarget,
  },
  largeTitles: {
    flex: 1,
  },
  /** Copia invisible del título para medir su ancho sin límite. */
  medida: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MEDIDA_ANCHO,
    opacity: 0,
  },
  medidaTexto: {
    alignSelf: 'flex-start',
  },
  largeSubtitle: {
    marginTop: Spacing.xs,
  },

  // compact
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  compactLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  compactTitles: {
    flex: 1,
  },

  // steps
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stepDot: {
    height: DOT_SIZE,
    borderRadius: Radius.full,
  },
  stepTitle: {
    marginTop: Spacing.lg,
  },
  stepSubtitle: {
    marginTop: Spacing.xs,
  },
});
