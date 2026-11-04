import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Truck, X } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/src/components/ui';
import { formatDiaHoraVE } from '@/src/utils/formatters';
import { getEncomiendaTimeline } from '@/src/utils/estados';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

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
    timestamp: etapa.fecha ? formatDiaHoraVE(etapa.fecha) : null,
    completado: etapa.situacion === 'completada',
    activo: etapa.situacion === 'actual',
    cortado: etapa.situacion === 'cortada',
    descripcion: etapa.situacion === 'actual' ? options.descripcionActual : undefined,
  }));
}

const ICON_BOX = Sizes.iconBox.sm;

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
          ? { fg: Colors.white, bg: Colors.destructive }
          : item.completado
            ? { fg: Colors.white, bg: Colors.success }
            : item.activo
              ? { fg: Colors.white, bg: Colors.accentStrong }
              : { fg: Colors.placeholder, bg: Colors.surfaceDark };

        return (
          <View
            key={item.estado}
            style={[s.row, isLast && s.rowUltima]}
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
                  { backgroundColor: item.completado ? Colors.success : Colors.surfaceDark },
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
                >
                  {item.label}
                </Text>
                {item.timestamp ? (
                  <Text variant="caption" color="muted" compact>
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
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);

  useEffect(() => {
    // Con "reducir movimiento" los iconos aparecen ya en su sitio.
    if (reduceMotion) {
      progress.value = 1;
      scale.value = 1;
      return;
    }
    const delay = Math.min(index, Motion.stagger.maxIndex) * Motion.stagger.step;
    progress.value = withDelay(delay, withTiming(1, { duration: Motion.duration.base }));
    scale.value = withDelay(delay, withSpring(1, Motion.spring.bouncy));
  }, [index, progress, scale, reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: scale.value }],
  }));

  const Icon = cortado ? X : completado ? Check : activo ? Truck : null;

  return (
    <Animated.View style={[s.icon, activo && s.iconActivo, { backgroundColor: background }, animStyle]}>
      {Icon ? (
        <Icon weight={activo ? 'fill' : 'bold'} color={color} size={Sizes.icon.sm} />
      ) : (
        <View style={[s.pendiente, { backgroundColor: color }]} />
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    paddingBottom: Spacing.xl,
    position: 'relative',
  },
  rowUltima: {
    paddingBottom: 0,
  },
  connector: {
    position: 'absolute',
    left: ICON_BOX / 2 - 1,
    top: ICON_BOX,
    bottom: 0,
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
  iconActivo: {
    ...Shadows.sky,
  },
  pendiente: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.full,
  },
  body: {
    flex: 1,
    marginLeft: Spacing.md,
    minHeight: ICON_BOX,
    justifyContent: 'center',
  },
  /** Etapa y, debajo, su fecha: en 360 pt la fecha al lado partía la etapa en dos líneas. */
  header: {
    gap: Spacing.xs / 2,
  },
  description: {
    marginTop: Spacing.xs,
  },
});
