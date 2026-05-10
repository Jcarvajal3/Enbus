import { View, Text } from '@/tw';
import { Package, Truck, CheckCircle, Clock } from 'phosphor-react-native';

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

import { useCSSVariable } from '@/tw';

export function StatusTimeline({ estados }: StatusTimelineProps) {
  const colorMuted = useCSSVariable('--muted-foreground') as string || '#a3a3a3';
  const colorSuccess = useCSSVariable('--success') as string || '#16a34a';
  const colorPrimary = useCSSVariable('--primary') as string || '#d4a017';
  return (
    <View className="ml-2 mt-4 mb-4">
      {estados.map((item, index) => {
        const isLastItem = index === estados.length - 1;

        let IconComponent = Clock;
        let iconColor = colorMuted; // muted
        let bgColor = 'bg-secondary';

        if (item.completado) {
          IconComponent = CheckCircle;
          iconColor = colorSuccess; // green-600
          bgColor = 'bg-success/20';
        } else if (item.activo) {
          IconComponent = Truck;
          iconColor = colorPrimary; // primary
          bgColor = 'bg-primary/20';
        }

        return (
          <View key={item.estado} className="flex-row mb-6 relative">
            {/* Línea conectora */}
            {!isLastItem && (
              <View
                 className={`absolute left-5 top-10 bottom-[-30px] w-0.5 z-0
                           ${item.completado ? 'bg-success' : 'bg-border/50'}`}
              />
            )}

            {/* Ícono de Estado */}
            <View className={`size-10 rounded-full items-center justify-center z-10 ${bgColor}`}>
              <IconComponent weight={item.completado ? "fill" : "bold"} color={iconColor} size={20} />
            </View>

            {/* Textos del Estado */}
            <View className="ml-4 flex-1 pt-1 mb-2">
              <View className="flex-row justify-between items-start">
                <Text className={`text-base font-bold ${item.activo ? 'text-foreground' : (item.completado ? 'text-foreground' : 'text-muted-foreground')}`}>
                  {item.label}
                </Text>
                {item.timestamp && (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    {item.timestamp}
                  </Text>
                )}
              </View>
              {item.descripcion && (
                <Text className="text-sm text-muted-foreground mt-1 leading-5">
                  {item.descripcion}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
