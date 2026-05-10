import { View, Text, Pressable } from '@/tw';
import { Package, Ticket, CaretRight } from 'phosphor-react-native';

export type TransactionType = 'encomienda_envio' | 'encomienda_recepcion' | 'boleto';

interface TransactionCardProps {
  type: TransactionType;
  id: string; // Tracking ID o código boleto
  estado: string;
  titulo: string; // Nombre destinatario / Remitente / Ruta
  subtitulo: string; // Fecha
  onPress?: () => void;
}

const getStatusBadge = (type: TransactionType, estado: string) => {
  let color = 'bg-muted';
  let text = 'text-muted-foreground';

  if (type === 'boleto') {
    switch (estado) {
      case 'RESERVADO': color = 'bg-warning/20'; text = 'text-warning'; break;
      case 'PAGADO': color = 'bg-success/20'; text = 'text-success'; break;
      case 'USADO': color = 'bg-muted'; text = 'text-muted-foreground'; break;
      case 'CANCELADO': color = 'bg-destructive/20'; text = 'text-destructive'; break;
      case 'EXPIRADO': color = 'bg-muted'; text = 'text-muted-foreground'; break;
    }
  } else {
    // encomienda
    switch (estado) {
      case 'PENDIENTE_DE_ESCANEO': color = 'bg-warning/20'; text = 'text-warning'; break;
      case 'EN_RECEPCION': color = 'bg-warning/20'; text = 'text-warning'; break;
      case 'POR_PAGAR': color = 'bg-destructive/20'; text = 'text-destructive'; break;
      case 'PAGADA': color = 'bg-info/20'; text = 'text-info'; break;
      case 'EN_TRANSITO': color = 'bg-info/20'; text = 'text-info'; break;
      case 'EN_OFICINA_DESTINO': color = 'bg-success/20'; text = 'text-success'; break;
      case 'ENTREGADA': color = 'bg-success/20'; text = 'text-success'; break;
      case 'CANCELADA': color = 'bg-muted'; text = 'text-muted-foreground'; break;
      case 'DEVUELTA': color = 'bg-destructive/20'; text = 'text-destructive'; break;
    }
  }

  return (
    <View className={`px-2.5 py-1 rounded-full ${color}`}>
      <Text className={`text-[10px] font-bold ${text}`}>
        {estado.replace(/_/g, ' ')}
      </Text>
    </View>
  );
};

export function TransactionCard({ type, id, estado, titulo, subtitulo, onPress }: TransactionCardProps) {
  const isBoleto = type === 'boleto';
  const Icon = isBoleto ? Ticket : Package;

  return (
    <Pressable
      onPress={onPress}
      className="bg-card border border-border rounded-[14px] p-4 w-full flex-col justify-between"
    >
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-row items-center gap-2 flex-shrink">
          <View className={`size-10 rounded-full items-center justify-center ${isBoleto ? 'bg-primary/20' : 'bg-info/10'}`}>
            <Icon color={isBoleto ? '#6b4a1a' : '#3b82f6'} weight="fill" size={20} />
          </View>
          <View className="flex-1 ml-2">
            <Text className="text-sm font-black text-foreground mb-1" numberOfLines={1}>
              {id}
            </Text>
            {getStatusBadge(type, estado)}
          </View>
        </View>
      </View>

      <View>
        <Text className="text-base font-bold text-foreground mb-1" numberOfLines={1}>
          {titulo}
        </Text>
        <Text className="text-xs font-semibold text-muted-foreground" numberOfLines={1}>
          {subtitulo}
        </Text>
      </View>
    </Pressable>
  );
}
