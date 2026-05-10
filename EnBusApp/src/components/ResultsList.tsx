import { View, Text, Pressable, ScrollView } from '@/tw';
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

export function ResultsList({ data, onSelect }: ResultsListProps) {
  if (data.length === 0) {
    return (
      <View className="py-12 items-center">
        <Text className="text-muted-foreground font-bold">No hay viajes disponibles para esta ruta.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="py-4">
      {data.map((item, index) => (
        <Pressable 
          key={index} 
          onPress={() => onSelect(item)}
          className="bg-card border border-border p-4 mb-4 rounded-[14px]"
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
              <CaretRight color="#171717" weight="bold" size={16} />
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
