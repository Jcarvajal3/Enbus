import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle, Clock, Truck, XCircle } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/src/components/ui';
import { dateTime, formatDate } from '@/src/utils/formatters';
import { getEncomiendaTimeline } from '@/src/utils/estados';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

export interface EstadoItem {
  estado: string;
  label: string;
  timestamp?: string | null;
  descripcion?: string;
  activo: boolean;
  completado: boolean;
  /** Terminal node (cancelled / returned): drawn in red and ends the timeline */
  cortado?: boolean;
}

/**
 * Timeline of a shipment for both the sender and the receiver screens, derived
 * from the single `estado → etapa` table in `estados.ts` (APP-44 / M-46). Las
 * etiquetas son las etapas del glosario (§4): Envío creado · Recibida en
 * taquilla · En camino · Lista para retirar · Entregada.
 */
export function buildEncomiendaTimeline(
  estado: string | null | undefined,
  historial: readonly { estado_nuevo: string; created_at: string }[],
  options: { creadaAt?: string | null; descripcionActual?: string } = {}
): EstadoItem[] {
  return getEncomiendaTimeline(estado, historial, options.creadaAt).map((etapa) => ({
    estado: etapa.id,
    label: etapa.label,
    timestamp: etapa.fecha ? formatDate(etapa.fecha, dateTime) : null,
    completado: etapa.situacion === 'completada',
    activo: etapa.situacion === 'actual',
    cortado: etapa.situacion === 'cortada',
    descripcion: etapa.situacion === 'actual' ? options.descripcionActual : undefined,
  }));
}

const ICON_BOX = Sizes.avatar.sm;

/**
 * Vertical progress of a shipment. The connector between two completed steps is
 * drawn in the success colour so the "how far along am I" question is answerable
 * at a glance without reading a single label.
 */
export function StatusTimeline({ estados }: { estados: EstadoItem[] }) {
  return (
    <View style={s.container}>
      {estados.map((item, index) => {
        const isLast = index === estados.length - 1;
        const tone = item.cortado
          ? { fg: Colors.destructive, bg: Colors.destructiveLight }
          : item.completado
            ? { fg: Colors.success, bg: Colors.successLight }
            : item.activo
              ? { fg: Colors.accent, bg: Colors.accentLight }
              : { fg: Colors.mutedForeground, bg: Colors.surface };

        return (
          <View
            key={item.estado}
            style={s.row}
            accessible
            accessibilityLabel={[
              item.label,
              item.cortado
                ? null
                : item.completado
                  ? 'completada'
                  : item.activo
                    ? 'etapa actual'
                    : 'pendiente',
              item.timestamp,
              item.descripcion,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {!isLast && (
              <View
                style={[
                  s.connector,
                  { backgroundColor: item.completado ? Colors.success : Colors.border },
                ]}
              />
            )}

            <TimelineIcon
              index={index}
              completado={item.completado}
              activo={item.activo}
              cortado={item.cortado}
              color={tone.fg}
              background={tone.bg}
            />

            <View style={s.body}>
              <View style={s.header}>
                <Text
                  variant="bodyStrong"
                  color={
                    item.cortado
                      ? 'dangerText'
                      : item.activo || item.completado
                        ? 'foreground'
                        : 'muted'
                  }
                  style={s.label}
                >
                  {item.label}
                </Text>
                {item.timestamp ? (
                  <Text variant="caption" size="xs" color="muted" weight="semibold" compact>
                    {item.timestamp}
                  </Text>
                ) : null}
              </View>

              {item.descripcion ? (
                <Text variant="caption" color="muted" style={s.description}>
                  {item.descripcion}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TimelineIcon({
  index,
  completado,
  activo,
  cortado,
  color,
  background,
}: {
  index: number;
  completado: boolean;
  activo: boolean;
  cortado?: boolean;
  color: string;
  background: string;
}) {
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    const delay = Math.min(index, Motion.stagger.maxIndex) * 80;
    progress.value = withDelay(delay, withTiming(1, { duration: Motion.duration.base }));
    scale.value = withDelay(delay, withSpring(1, Motion.spring.bouncy));
  }, [index, progress, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: scale.value }],
  }));

  const Icon = cortado ? XCircle : completado ? CheckCircle : activo ? Truck : Clock;

  return (
    <Animated.View style={[s.icon, { backgroundColor: background }, animStyle]}>
      <Icon
        weight={completado || cortado ? 'fill' : 'bold'}
        color={color}
        size={Sizes.icon.lg}
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    marginBottom: Spacing['2xl'],
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    left: ICON_BOX / 2 - 1,
    top: ICON_BOX,
    bottom: -Spacing['2xl'],
    width: 2,
    zIndex: 0,
  },
  icon: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  body: {
    flex: 1,
    marginLeft: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  label: {
    flex: 1,
  },
  description: {
    marginTop: Spacing.xs,
  },
});
