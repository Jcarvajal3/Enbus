/**
 * Aviso — el único bloque de aviso dentro de una pantalla (estado de un pago, reserva
 * vencida, una instrucción). Tinte del tono, icono en un círculo blanco y el texto en
 * tinta: se lee como información, no como decoración.
 *
 *   <Aviso tono="success" icon={CheckCircle} titulo="Pago confirmado">El envío está pagado.</Aviso>
 *   <Aviso tono="warning" texto="Aún no tenemos la tasa de hoy." />
 *   <Aviso tono="progress" icon={Clock} titulo="Pago en verificación" extra={<Monto … />}>…</Aviso>
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CheckCircle, Info, WarningCircle, XCircle, type IconProps } from 'phosphor-react-native';
import { Text } from './Text';
import { Colors, Radius, Shadows, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';

export type AvisoTono = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const TONO_A_ESTADO: Record<AvisoTono, StatusTone> = {
  info: 'progress',
  warning: 'pending',
  success: 'success',
  danger: 'danger',
  neutral: 'neutral',
};

const ICONO: Record<AvisoTono, React.ComponentType<IconProps>> = {
  info: Info,
  warning: WarningCircle,
  success: CheckCircle,
  danger: XCircle,
  neutral: Info,
};

export function Aviso({
  tono = 'info',
  estado,
  icon,
  titulo,
  texto,
  children,
  extra,
  style,
  alerta,
}: {
  tono?: AvisoTono;
  /** Toma el color de un estado del dominio en vez de `tono` */
  estado?: StatusTone;
  icon?: React.ComponentType<IconProps>;
  titulo?: string;
  texto?: string;
  children?: React.ReactNode;
  /** Lo que va debajo del texto: un monto, un botón pequeño */
  extra?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Se anuncia solo al lector de pantalla */
  alerta?: boolean;
}) {
  const claveTono = estado ?? TONO_A_ESTADO[tono];
  const paleta = StatusPalette[claveTono];
  const Icono = icon ?? ICONO[tono];
  // El neutro no tiene color propio: se separa del fondo como una tarjeta.
  const neutro = claveTono === 'neutral' || claveTono === 'done';
  const cuerpo = texto ?? children;

  return (
    <View
      style={[s.caja, neutro ? s.cajaNeutra : { backgroundColor: paleta.bg }, style]}
      accessibilityRole={alerta ? 'alert' : undefined}
      accessibilityLiveRegion={alerta ? 'polite' : undefined}
    >
      <View style={[s.icono, neutro && s.iconoNeutro]}>
        <Icono size={Sizes.icon.md} color={neutro ? Colors.mutedForeground : paleta.fg} weight="fill" />
      </View>
      <View style={s.cuerpo}>
        {titulo ? <Text variant="bodyStrong">{titulo}</Text> : null}
        {typeof cuerpo === 'string' ? (
          <Text variant="secondary" color={titulo ? 'muted' : 'foreground'}>
            {cuerpo}
          </Text>
        ) : (
          cuerpo
        )}
        {extra}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  cajaNeutra: {
    backgroundColor: Colors.card,
    ...Shadows.card,
  },
  iconoNeutro: {
    backgroundColor: Colors.surface,
    boxShadow: undefined,
  },
  icono: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  cuerpo: {
    flex: 1,
    gap: Spacing.xs / 2,
    alignSelf: 'center',
  },
});
