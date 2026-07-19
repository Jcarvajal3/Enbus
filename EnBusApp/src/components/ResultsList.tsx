import React, { memo, useCallback } from 'react';
import { FlatList, ListRenderItem, StyleSheet } from 'react-native';
import { View, Text, useCSSVariable } from '@/tw';
import { CaretRight, Clock, CalendarBlank } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import { Colors, Typography, Radius, Shadows } from '@/src/theme';

interface ResultItem {
  id: string;
  cooperativa: string;
  horaSalida: string;
  duracion: string;
  precio: number;
  asientosDisponibles: number;
}

interface ResultsListProps {
  data: ResultItem[];
  onSelect: (id: string) => void;
}

// PERF-07: Extracted as a separate memoized component so that only rows whose
// data actually changed are re-rendered when the list updates (e.g. seat count
// changes via Realtime). Without memo, every onSelect callback update would
// trigger a full re-render of all visible rows.
const ResultRow = memo(({ item, onSelect, foregroundColor }: {
  item: ResultItem;
  onSelect: (id: string) => void;
  foregroundColor: string;
}) => {
  const firstLetter = item.cooperativa ? item.cooperativa.charAt(0).toUpperCase() : 'V';
  
  // Use a soft theme color for the letter pill
  const pillBg = 'rgba(74, 127, 248, 0.12)';
  const pillTextColor = Colors.accent;

  // Badge for seats
  let seatsBg = 'rgba(16, 185, 129, 0.12)';
  let seatsTextColor: string = '#059669';
  if (item.asientosDisponibles < 5) {
    seatsBg = 'rgba(239, 68, 68, 0.12)';
    seatsTextColor = '#DC2626';
  }

  return (
    <PressableScale
      onPress={() => onSelect(item.id)}
      haptic
      scaleValue={0.97}
      style={s.cardContainer}
    >
      <View style={s.card}>
        <View style={s.leftContent}>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: seatsBg }]}>
              <Text style={[s.badgeText, { color: seatsTextColor }]}>
                {item.asientosDisponibles} ASIENTOS
              </Text>
            </View>
            <Text style={s.priceText}>
              {item.precio.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bs
            </Text>
          </View>
          
          <Text style={s.titulo} numberOfLines={1}>
            {item.cooperativa}
          </Text>
          
          <Text style={s.subtitulo}>
            {item.horaSalida} • {item.duracion}
          </Text>
        </View>
        <View style={[s.rightPill, { backgroundColor: pillBg }]}>
          <Text style={[s.rightPillText, { color: pillTextColor }]}>
            {firstLetter}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

ResultRow.displayName = 'ResultRow';

// PERF-01: FlatList for virtualized rendering.
// PERF-07: Component is wrapped in memo to prevent re-renders when the parent
// (resultados.tsx) re-renders for filter/sort state changes.
export const ResultsList = memo(({ data, onSelect }: ResultsListProps) => {
  // BUG-08 fix: use CSS variable instead of hardcoded color
  const foregroundColor = useCSSVariable('--foreground') as string || Colors.foreground;

  // Stable renderItem callback
  const renderItem = useCallback<ListRenderItem<ResultItem>>(({ item }) => (
    <ResultRow item={item} onSelect={onSelect} foregroundColor={foregroundColor} />
  ), [onSelect, foregroundColor]);

  const keyExtractor = useCallback((item: ResultItem) => item.id, []);

  const emptyComponent = (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <CalendarBlank color={Colors.mutedForeground} weight="bold" size={32} />
      </View>
      <Text style={s.emptyTitle}>Sin viajes programados</Text>
      <Text style={s.emptySubtitle}>
        No hay viajes activos o disponibles para la fecha seleccionada. Intenta con otro día u otro trayecto.
      </Text>
    </View>
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListEmptyComponent={emptyComponent}
      contentContainerStyle={{ paddingVertical: 16 }}
      showsVerticalScrollIndicator={false}
      // Performance tuning
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={5}
      initialNumToRender={8}
      getItemLayout={(_data, index) => ({
        length: 88,
        offset: 88 * index,
        index,
      })}
    />
  );
});

ResultsList.displayName = 'ResultsList';

const s = StyleSheet.create({
  empty: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.surface,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: Typography.weights.bold,
    fontFamily: Typography.family,
    color: Colors.foreground,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  cardContainer: {
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  priceText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
  },
  titulo: {
    fontSize: 16,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginTop: 8,
    marginBottom: 6,
  },
  subtitulo: {
    fontSize: 12,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  rightPill: {
    width: 50,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  rightPillText: {
    fontSize: 24,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
});
