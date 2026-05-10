import { View, Text } from '@/tw';
import { useEffect } from 'react';
import QRCode from 'react-native-qrcode-svg';

interface QRCodeViewerProps {
  data: string;
  size?: number;
  autoMaxBrightness?: boolean;
}

export function QRCodeViewer({ data, size = 200, autoMaxBrightness = true }: QRCodeViewerProps) {
  // Simularemos aquí el brillo máximo con useEffect en producción
  useEffect(() => {
    if (autoMaxBrightness) {
      // lógica `expo-brightness` de subida aquí
    }
    return () => {
      // lógica de restauración
    };
  }, [autoMaxBrightness]);

  return (
    <View className="items-center justify-center p-6 bg-white rounded-[14px] border border-border mx-auto">
      <QRCode 
        value={data}
        size={size}
        color="#171717"
        backgroundColor="#ffffff"
      />
      <Text className="text-xs text-muted-foreground font-mono font-bold mt-4 tracking-widest uppercase">
        {data}
      </Text>
    </View>
  );
}
