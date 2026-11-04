/**
 * Card / Surface primitives.
 *
 * Figura y fondo: la tarjeta de contenido es `raised`, blanca sobre `canvas`, con
 * sombra suave y sin borde. Lo que va dentro y debe leerse hundido es `well`
 * (`surface`). Los volúmenes se separan por tono y sombra, no por líneas.
 * Radio: tarjeta `xl` (24); bloque dentro de una tarjeta `md` (16).
 */
import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { IconProps } from 'phosphor-react-native';
import { Text } from './Text';
import { Colors, Gradients, Radius, Shadows, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';

export type CardTone = 'raised' | 'well' | 'outline' | 'flat';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends ViewProps {
  tone?: CardTone;
  padding?: CardPadding;
  /** Sombra suave. Por defecto solo en `raised`. */
  elevated?: boolean;
  radius?: keyof typeof Radius;
  children?: React.ReactNode;
}

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: Spacing.lg,
  md: Spacing.xl,
  lg: Spacing['2xl'],
};

const TONES: Record<CardTone, ViewStyle> = {
  raised: { backgroundColor: Colors.card },
  well: { backgroundColor: Colors.surface },
  outline: {
    backgroundColor: Colors.card,
    borderWidth: Sizes.hairline,
    borderColor: Colors.borderControl,
  },
  flat: { backgroundColor: Colors.transparent },
};

export function Card({
  tone = 'raised',
  padding = 'md',
  elevated,
  radius,
  style,
  children,
  ...rest
}: CardProps) {
  const shouldElevate = elevated ?? tone === 'raised';
  const radio = radius ?? (tone === 'well' ? 'md' : 'xl');

  return (
    <View
      {...rest}
      style={[
        s.curva,
        TONES[tone],
        { padding: PADDING[padding], borderRadius: Radius[radio] },
        shouldElevate ? Shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Icon tile ───────────────────────────────────────────────────────────────

export type IconTileTone = 'neutral' | 'brand' | 'sky' | 'coral' | 'mint' | 'solido' | 'status';

const FONDOS_TILE: Partial<Record<IconTileTone, readonly [string, string]>> = {
  brand: Gradients.sunSoft,
  sky: Gradients.skySoft,
  coral: Gradients.coralSoft,
  mint: Gradients.mint,
  solido: [Gradients.sun[0], Gradients.sun[2]],
};

const COLOR_ICONO: Record<IconTileTone, string> = {
  neutral: Colors.foreground,
  brand: Colors.primaryText,
  sky: Colors.accentStrong,
  coral: Colors.secondaryDeep,
  mint: Colors.successText,
  solido: Colors.foreground,
  status: Colors.foreground,
};

/**
 * Cuadrito redondeado con el icono de una fila o de un selector. Es el sitio donde
 * entra el color en una pantalla de tinta: `sky` para datos y boletos, `coral` para
 * encomiendas, `brand` para lo de marca, `mint` para lo logrado, `solido` para lo
 * principal. Con `icon` pinta el icono en duotono con el color del tono; `estado`
 * toma el color de un estado del dominio.
 */
export function IconTile({
  children,
  tone = 'neutral',
  size = 'md',
  icon: Icon,
  estado,
  fondo,
  style,
}: {
  children?: React.ReactNode;
  tone?: IconTileTone;
  size?: keyof typeof Sizes.tile;
  icon?: React.ComponentType<IconProps>;
  /** Toma el tinte de un estado (`StatusPalette`) */
  estado?: StatusTone;
  fondo?: string;
  style?: ViewStyle;
}) {
  const lado = Sizes.tile[size];
  const paleta = estado ? StatusPalette[estado] : null;
  const gradiente = !paleta && !fondo ? FONDOS_TILE[tone] : undefined;
  const glifo = size === 'lg' ? Sizes.icon.xl : size === 'md' ? Sizes.icon.lg : Sizes.icon.md;

  return (
    <View
      style={[
        s.tile,
        s.curva,
        {
          width: lado,
          height: lado,
          borderRadius: size === 'sm' ? Radius.sm + Spacing.xs : Radius.md,
          backgroundColor: paleta?.bg ?? fondo ?? Colors.surface,
        },
        style,
      ]}
    >
      {gradiente ? <LinearGradient colors={[...gradiente]} style={StyleSheet.absoluteFill} /> : null}
      <View style={s.tileContenido}>
        {Icon ? (
          <Icon
            size={glifo}
            color={paleta?.fg ?? COLOR_ICONO[tone]}
            weight={tone === 'solido' ? 'fill' : 'duotone'}
          />
        ) : (
          children
        )}
      </View>
    </View>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────

/**
 * Título de sección, encima de su tarjeta (no dentro). Es un sustantivo ("Quién
 * paga", "Datos de quien recibe"), nunca una pregunta. Va en frase normal y con peso:
 * es parte de la jerarquía, no una etiqueta diminuta.
 */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.sectionLabel, style]}>
      <Text variant="overline" accessibilityRole="header">
        {children}
      </Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ spacing = Spacing.lg }: { spacing?: number }) {
  return <View style={[s.divider, { marginVertical: spacing }]} />;
}

// ─── Perforación ─────────────────────────────────────────────────────────────

/** Rayitas de la perforación: se recortan al ancho disponible. */
const RAYAS = Array.from({ length: 48 }, (_, i) => i);

/**
 * La perforación de un boleto: línea punteada con dos muescas del color del fondo.
 * Es el motivo que une boletos, pases y resúmenes de compra. Las rayas son vistas y
 * no un borde `dashed`, que en Android e iOS se dibuja distinto en un solo lado.
 */
export function Perforacion({
  fondo = Colors.canvas,
  margen = Spacing.xl,
}: {
  /** Color de lo que hay detrás de la tarjeta */
  fondo?: string;
  /** Padding horizontal de la tarjeta: las muescas se salen hasta su borde */
  margen?: number;
}) {
  return (
    <View style={[s.perforacion, { marginHorizontal: -margen }]}>
      <View style={[s.muesca, s.muescaIzquierda, { backgroundColor: fondo }]} />
      <View style={s.rayas}>
        {RAYAS.map((i) => (
          <View key={i} style={s.raya} />
        ))}
      </View>
      <View style={[s.muesca, s.muescaDerecha, { backgroundColor: fondo }]} />
    </View>
  );
}

// ─── Info row ────────────────────────────────────────────────────────────────

/**
 * Label-over-value row used in every detail screen (perfil, boleto, encomienda).
 * Optional leading icon, optional top border for stacked groups.
 */
export function InfoRow({
  label,
  value,
  icon,
  divided,
  align = 'left',
  valueColor,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  divided?: boolean;
  align?: 'left' | 'right';
  valueColor?: string;
}) {
  return (
    <View style={[s.infoRow, align === 'left' && s.infoRowShrink, divided && s.infoRowDivided]}>
      {icon}
      <View style={[s.infoRowBody, align === 'right' && s.infoRowBodyEnd]}>
        <Text variant="caption" color="muted" align={align === 'right' ? 'right' : 'left'}>
          {label}
        </Text>
        <Text variant="bodyStrong" color={valueColor} align={align === 'right' ? 'right' : 'left'}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const NOTCH = Spacing.xl;

const s = StyleSheet.create({
  curva: {
    borderCurve: 'continuous',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** Sobre el gradiente: en web, un SVG suelto quedaría debajo de lo posicionado. */
  tileContenido: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    marginBottom: Spacing.md,
  },
  divider: {
    height: Sizes.hairline,
    backgroundColor: Colors.border,
  },
  perforacion: {
    height: NOTCH,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rayas: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginHorizontal: NOTCH,
    overflow: 'hidden',
  },
  raya: {
    width: Spacing.sm,
    height: Sizes.borderStrong,
    borderRadius: Radius.full,
    backgroundColor: Colors.borderControl,
  },
  muesca: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: Radius.full,
    top: 0,
  },
  muescaIzquierda: {
    left: -NOTCH / 2,
  },
  muescaDerecha: {
    right: -NOTCH / 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  /**
   * En una fila de dos (Contenido | Peso) cede ancho la de la izquierda y parte
   * su valor en vez de salirse de la tarjeta; la derecha (cifra corta) no.
   */
  infoRowShrink: {
    flexShrink: 1,
  },
  infoRowDivided: {
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.borderLight,
  },
  /**
   * Solo `flexShrink`: en una fila de dos el `InfoRow` no tiene ancho propio.
   * Con `flex: 1` o `flexGrow`, el Yoga de React Native mide el texto con ancho 0
   * y la fila queda altísima, con el texto partido letra por letra en la medida.
   */
  infoRowBody: {
    flexShrink: 1,
    gap: Spacing.xs / 2,
  },
  infoRowBodyEnd: {
    alignItems: 'flex-end',
  },
});
