/**
 * RouteSummary — the ORIGEN ──●── DESTINO block.
 *
 * Rendered three times in `boletos/buscar` and once in `viajes/[id]` as copied
 * JSX plus ~15 copied style rules each. Extracting it also fixed the alignment
 * drift between those copies (one had `marginBottom: 6` on the timeline, the
 * others didn't).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock } from 'phosphor-react-native';
import { Text } from './Text';
import { formatCity } from '@/src/utils/formatters';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

const DOT = Spacing.sm;

export interface RouteSummaryProps {
  origen?: string | null;
  destino?: string | null;
  /** e.g. "5h 30m" — shown under the connector when present */
  duration?: string;
}

/** Three-letter airport-style code derived from a city name. */
export function cityCode(city?: string | null): string {
  const name = formatCity(city);
  return name ? name.substring(0, 3).toUpperCase() : '—';
}

export function RouteSummary({ origen, destino, duration }: RouteSummaryProps) {
  return (
    <View
      style={s.row}
      accessibilityLabel={`Ruta de ${formatCity(origen)} a ${formatCity(destino)}${
        duration ? `, duración ${duration}` : ''
      }`}
    >
      <View style={s.endpoint}>
        <Text variant="title" size="2xl" weight="heavy" align="center" compact>
          {cityCode(origen)}
        </Text>
        <Text variant="caption" color="muted" align="center" numberOfLines={1} style={s.cityName}>
          {formatCity(origen)}
        </Text>
      </View>

      <View style={s.middle}>
        <View style={s.timeline}>
          <View style={[s.dot, { backgroundColor: Colors.accent }]} />
          <View style={s.line} />
          <View style={[s.dot, { backgroundColor: Colors.secondary }]} />
        </View>
        {duration ? (
          <View style={s.durationRow}>
            <Clock color={Colors.mutedForeground} weight="fill" size={Sizes.icon.xs} />
            <Text variant="caption" color="muted" weight="bold" compact>
              {duration}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.endpoint}>
        <Text variant="title" size="2xl" weight="heavy" align="center" compact>
          {cityCode(destino)}
        </Text>
        <Text variant="caption" color="muted" align="center" numberOfLines={1} style={s.cityName}>
          {formatCity(destino)}
        </Text>
      </View>
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
  cityName: {
    marginTop: Spacing.xs,
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: Spacing.xs + 2,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.full,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
