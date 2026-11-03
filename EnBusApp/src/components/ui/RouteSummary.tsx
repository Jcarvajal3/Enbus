/**
 * RouteSummary — the ORIGEN ──●── DESTINO block.
 *
 * Rendered three times in `boletos/buscar` and once in `viajes/[id]` as copied
 * JSX plus ~15 copied style rules each. Extracting it also fixed the alignment
 * drift between those copies (one had `marginBottom: 6` on the timeline, the
 * others didn't).
 *
 * Muestra el nombre completo de cada ciudad (hasta 2 líneas) y, si se pasan,
 * la hora de salida y la de llegada debajo (APP-58). Antes eran códigos de
 * tres letras tipo aeropuerto ("MER", "CAR") que nadie usa en Venezuela.
 *
 * D10: los extremos usan los mismos glifos neutros que `RouteField` (origen
 * `Circle` bold, destino `MapPin` fill, en `foreground`), nunca azul ni coral.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Clock, MapPin } from 'phosphor-react-native';
import { Text } from './Text';
import { formatCity } from '@/src/utils/formatters';
import { Colors, Sizes, Spacing } from '@/src/theme';

export interface RouteSummaryProps {
  origen?: string | null;
  destino?: string | null;
  /** e.g. "9 h 45 min" — shown under the connector when present */
  duration?: string;
  /** Hora de salida ya formateada ("8:30 p. m."), bajo el origen */
  horaSalida?: string;
  /** Hora de llegada ya formateada ("6:15 a. m. (+1)"), bajo el destino */
  horaLlegada?: string;
}

/**
 * Three-letter airport-style code derived from a city name.
 * @deprecated Sin uso desde la fase 4 (APP-58): `RouteSummary` muestra el nombre
 * completo. Se conserva porque `ui/index.ts` la reexporta.
 */
export function cityCode(city?: string | null): string {
  const name = formatCity(city);
  return name ? name.substring(0, 3).toUpperCase() : '—';
}

export function RouteSummary({
  origen,
  destino,
  duration,
  horaSalida,
  horaLlegada,
}: RouteSummaryProps) {
  const etiqueta = [
    `Ruta de ${formatCity(origen)} a ${formatCity(destino)}`,
    horaSalida ? `sale ${horaSalida}` : '',
    horaLlegada ? `llega ${horaLlegada.replace('(+1)', 'del día siguiente')}` : '',
    duration ? `duración ${duration}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={s.row} accessible accessibilityLabel={etiqueta}>
      <Endpoint ciudad={origen} hora={horaSalida} />

      <View style={s.middle}>
        <View style={s.timeline}>
          <Circle size={Sizes.icon.sm} color={Colors.foreground} weight="bold" />
          <View style={s.line} />
          <MapPin size={Sizes.icon.sm} color={Colors.foreground} weight="fill" />
        </View>
        {duration ? (
          <View style={s.durationRow}>
            <Clock color={Colors.mutedForeground} weight="bold" size={Sizes.icon.xs} />
            <Text variant="caption" color="muted" weight="bold" compact>
              {duration}
            </Text>
          </View>
        ) : null}
      </View>

      <Endpoint ciudad={destino} hora={horaLlegada} />
    </View>
  );
}

function Endpoint({ ciudad, hora }: { ciudad?: string | null; hora?: string }) {
  return (
    <View style={s.endpoint}>
      <Text variant="subheading" align="center" numberOfLines={2}>
        {formatCity(ciudad)}
      </Text>
      {hora ? (
        <Text variant="caption" color="muted" weight="bold" align="center" style={s.hora}>
          {hora}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  endpoint: {
    flex: 1,
    alignItems: 'center',
  },
  hora: {
    marginTop: Spacing.xs,
  },
  middle: {
    // Más angosto que los extremos: los nombres completos necesitan el espacio.
    flex: 0.7,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  line: {
    flex: 1,
    height: Sizes.borderStrong,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
