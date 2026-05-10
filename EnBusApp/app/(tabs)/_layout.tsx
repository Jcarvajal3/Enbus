import { Tabs, useRouter } from 'expo-router';
import { Package, House, Ticket, Bell, UserCircle } from 'phosphor-react-native';
import { useCSSVariable, Text, View, Pressable } from '@/tw';

export default function TabLayout() {
  const activeColor = useCSSVariable('--primary') || '#e2b714';
  const inactiveColor = useCSSVariable('--muted-foreground') || '#a3a3a3';
  const bgColor = useCSSVariable('--background') || '#ffffff';
  const borderColor = useCSSVariable('--border') || '#e5e5e5';

  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor as string,
        tabBarInactiveTintColor: inactiveColor as string,
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: borderColor as string,
          backgroundColor: bgColor as string,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Lora-SemiBold', // Fallback solucionado según Spec §2.3
          fontSize: 12,
          fontWeight: '600'
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <House size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="encomiendas"
        options={{
          title: 'Encomiendas',
          tabBarIcon: ({ color }) => <Package size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="boletos"
        options={{
          title: 'Boletos',
          tabBarIcon: ({ color }) => <Ticket size={24} color={color} weight="fill" />,
        }}
      />
    </Tabs>
  );
}
