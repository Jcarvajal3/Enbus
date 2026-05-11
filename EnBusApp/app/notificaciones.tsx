import { SafeAreaView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { useRouter } from 'expo-router';
import { CaretLeft, Bell } from 'phosphor-react-native';

export default function NotificacionesScreen() {
  const router = useRouter();

  // Solo el ícono necesita el valor literal — el resto usa className
  const mutedColor = useCSSVariable('--muted-foreground') as string || '#737373';
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-border gap-4">
        <Pressable
          onPress={() => router.back()}
          className="size-10 bg-secondary rounded-full items-center justify-center"
        >
          <CaretLeft weight="bold" color={foregroundColor} size={22} />
        </Pressable>
        <Text className="font-heading text-xl text-foreground">Notificaciones</Text>
      </View>

      {/* Empty state */}
      <View className="flex-1 items-center justify-center p-10 gap-3">
        <Bell color={mutedColor} size={48} weight="thin" />
        <Text className="text-lg font-bold text-foreground">Sin notificaciones</Text>
        <Text className="text-sm text-muted-foreground text-center leading-[22px]">
          Aquí aparecerán los cambios de estado de tus paquetes y viajes.
        </Text>
      </View>
    </SafeAreaView>
  );
}
