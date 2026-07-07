import React, { memo, useCallback } from 'react';
import { FlatList, ListRenderItem } from 'react-native';
import { View, Text, Pressable, useCSSVariable } from '@/tw';
import { CaretRight, Clock } from 'phosphor-react-native';

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
}) => (
  <Pressable
    onPress={() => onSelect(item.id)}
    className="bg-card border border-border p-4 mb-4 rounded-[14px] flex-row"
  >
    {/* Timeline miniatura */}
    <View className="items-center justify-center mr-4 w-16">
      <Text className="text-base font-black text-foreground">{item.horaSalida}</Text>
      <View className="flex-row items-center my-1 space-x-1">
        <Clock color="#a3a3a3" size={12} weight="bold" />
        <Text className="text-[10px] uppercase font-bold text-muted-foreground">{item.duracion}</Text>
      </View>
    </View>

    {/* Info del viaje */}
    <View className="flex-1 border-l border-border/50 pl-4">
      <Text className="text-sm font-bold text-foreground mb-1">{item.cooperativa}</Text>
      <Text className="text-xs text-primary font-bold">{item.asientosDisponibles} Asientos disponibles</Text>
    </View>

    {/* Precio y CTA */}
    <View className="items-end justify-center pl-2">
      <Text className="text-lg font-black text-foreground">{item.precio}$</Text>
      <View className="mt-1 bg-secondary rounded-full w-8 h-8 flex items-center justify-center">
        <CaretRight color={foregroundColor} weight="bold" size={16} />
      </View>
    </View>
  </Pressable>
));

ResultRow.displayName = 'ResultRow';

// PERF-01: Replaced ScrollView + .map() with FlatList for virtualized rendering.
// With ScrollView, all items are mounted at once — on slow devices with 50+
// results this causes a noticeable frame drop on first render. FlatList only
// mounts visible rows, dramatically reducing initial render time.
// PERF-07: Component is wrapped in memo to prevent re-renders when the parent
// (resultados.tsx) re-renders for filter/sort state changes.
export const ResultsList = memo(({ data, onSelect }: ResultsListProps) => {
  // BUG-08 fix: use CSS variable instead of hardcoded color
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  // Stable renderItem callback — useCallback prevents FlatList from
  // re-rendering all rows when the parent re-renders.
  const renderItem = useCallback<ListRenderItem<ResultItem>>(({ item }) => (
    <ResultRow item={item} onSelect={onSelect} foregroundColor={foregroundColor} />
  ), [onSelect, foregroundColor]);

  const keyExtractor = useCallback((item: ResultItem) => item.id, []);

  const emptyComponent = (
    <View className="py-12 items-center">
      <Text className="text-muted-foreground font-bold">No hay viajes disponibles para esta ruta.</Text>
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
        length: 88, // approximate card height (padding + content)
        offset: 88 * index,
        index,
      })}
    />
  );
});

ResultsList.displayName = 'ResultsList';
