import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { View, Text } from '@/tw';
import { Package, Truck, CheckCircle, Clock } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Typography, Radius } from '@/src/theme';

interface EstadoItem {
  estado: string;
  label: string;
  timestamp?: string | null;
  descripcion?: string;
  activo: boolean;
  completado: boolean;
}

interface StatusTimelineProps {
  estados: EstadoItem[];
}

// Ícono animado con spring scale al montar (P2)
function AnimatedTimelineIcon({
  index,
  completado,
  activo,
  iconColor,
  bgColor,
}: {
  index: number;
  completado: boolean;
  activo: boolean;
  iconColor: string;
  bgColor: string;
}) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 80;
    scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 180 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const IconComponent = completado ? CheckCircle : activo ? Truck : Clock;

  return (
    <Animated.View
      style={[
        styles.iconCircle,
        { backgroundColor: bgColor },
        animStyle,
      ]}
    >
      <IconComponent
        weight={completado ? 'fill' : 'bold'}
        color={iconColor}
        size={20}
      />
    </Animated.View>
  );
}

export function StatusTimeline({ estados }: StatusTimelineProps) {
  return (
    <View style={styles.container}>
      {estados.map((item, index) => {
        const isLastItem = index === estados.length - 1;

        let iconColor: string = Colors.mutedForeground;
        let bgColor: string = Colors.surface;

        if (item.completado) {
          iconColor = Colors.success;
          bgColor = Colors.successLight || 'rgba(34, 197, 94, 0.12)';
        } else if (item.activo) {
          iconColor = Colors.accent;
          bgColor = Colors.accentLight;
        }

        return (
          <View key={item.estado} style={styles.row}>
            {/* Línea conectora */}
            {!isLastItem && (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: item.completado ? Colors.success : Colors.border },
                ]}
              />
            )}

            <AnimatedTimelineIcon
              index={index}
              completado={item.completado}
              activo={item.activo}
              iconColor={iconColor}
              bgColor={bgColor}
            />

            <View style={styles.textBlock}>
              <View style={styles.textHeader}>
                <Text
                  style={[
                    styles.labelText,
                    {
                      color:
                        item.activo || item.completado ? Colors.foreground : Colors.mutedForeground,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.timestamp && (
                  <Text style={styles.timestamp}>{item.timestamp}</Text>
                )}
              </View>
              {item.descripcion && (
                <Text style={styles.descripcion}>{item.descripcion}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 24,
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    left: 19,
    top: 40,
    bottom: -24,
    width: 2,
    zIndex: 0,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  textBlock: {
    marginLeft: 16,
    flex: 1,
    paddingTop: 4,
    marginBottom: 8,
  },
  textHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  labelText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    fontFamily: Typography.family,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.mutedForeground,
    fontFamily: Typography.family,
  },
  descripcion: {
    fontSize: 13,
    color: Colors.mutedForeground,
    marginTop: 4,
    lineHeight: 18,
    fontFamily: Typography.family,
  },
});
