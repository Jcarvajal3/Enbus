import React, { useState } from 'react';
import { View, Text, Pressable } from '@/tw';
import { Platform } from 'react-native';
import { LocationSelector } from './LocationSelector';
import { Localidad } from '../utils/venezuela';
import { CalendarBlank, ArrowsLeftRight, ArrowRight } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface SearchFormProps {
  mode?: 'boletos' | 'encomiendas';
  showModeToggle?: boolean;
  initialOrigen?: Localidad;
  initialDestino?: Localidad;
  onSubmit: (data: { origen: Localidad; destino: Localidad; fecha?: string; mode: string }) => void;
}

export function SearchForm({
  mode: initialMode = 'boletos',
  showModeToggle = false,
  initialOrigen,
  initialDestino,
  onSubmit
}: SearchFormProps) {
  const [currentMode, setCurrentMode] = useState<'boletos' | 'encomiendas'>(initialMode);
  const [origen, setOrigen] = useState<Localidad | null>(initialOrigen || null);
  const [destino, setDestino] = useState<Localidad | null>(initialDestino || null);

  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setFecha(selectedDate);
  };

  const handleSubmit = () => {
    if (!origen || !destino) return;
    onSubmit({
      mode: currentMode,
      origen,
      destino,
      ...(currentMode === 'boletos' ? { fecha: fecha.toISOString() } : {})
    });
  };

  const swapLocations = () => {
    const temp = origen;
    setOrigen(destino);
    setDestino(temp);
  };

  const isBoleto = currentMode === 'boletos';

  const renderLocationTrigger = (label: string, value: Localidad | null, align: 'left' | 'right', openModal: () => void) => (
    <Pressable onPress={openModal} className={`flex-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <Text className="text-xs text-muted-foreground mb-1 font-bold">{label}</Text>
      <Text className="text-4xl font-heading text-foreground tracking-tight">
        {value ? value.ciudad.substring(0, 3).toUpperCase() : '---'}
      </Text>
      <Text className="text-sm font-medium text-muted-foreground mt-1">
        {value ? value.ciudad : 'Elegir'}
      </Text>
    </Pressable>
  );

  return (
    <View className="bg-card rounded-[14px] border border-border/50 overflow-hidden">
      {/* Segmented Control (Tabs integrados) */}
      {showModeToggle && (
        <View className="flex-row border-b border-border/50">
          <Pressable
            onPress={() => setCurrentMode('boletos')}
            className={`flex-1 py-4 items-center ${isBoleto ? 'border-b-2 border-primary' : ''}`}
          >
            <Text className={`font-bold text-sm uppercase tracking-widest ${isBoleto ? 'text-primary' : 'text-muted-foreground'}`}>
              Viajar
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCurrentMode('encomiendas')}
            className={`flex-1 py-4 items-center ${!isBoleto ? 'border-b-2 border-primary' : ''}`}
          >
            <Text className={`font-bold text-sm uppercase tracking-widest ${!isBoleto ? 'text-primary' : 'text-muted-foreground'}`}>
              Enviar
            </Text>
          </Pressable>
        </View>
      )}

      <View className="p-6">
        
        {/* Origen / Swap / Destino */}
        <View className="flex-row justify-between items-center pb-6">
          <LocationSelector
            label="Origen"
            value={origen}
            onChange={setOrigen}
            customTrigger={(openModal) => renderLocationTrigger('Desde', origen, 'left', openModal)}
          />

          <Pressable onPress={swapLocations} className="px-4">
            <ArrowsLeftRight size={24} color="#a3a3a3" />
          </Pressable>

          <LocationSelector
            label="Destino"
            value={destino}
            onChange={setDestino}
            customTrigger={(openModal) => renderLocationTrigger('Hacia', destino, 'right', openModal)}
          />
        </View>

        {/* Date Row (Solo para Boletos) */}
        {isBoleto && (
          <View className="flex-row border-t border-border/50 py-5 items-center justify-between">
            <Pressable className="flex-1" onPress={() => setShowDatePicker(true)}>
              <Text className="text-base font-bold text-foreground">
                {fecha.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </Pressable>
            
            <CalendarBlank color="#e2b714" weight="bold" size={24} className="mx-2" />
            
            <Pressable className="flex-1 items-end">
              <Text className="text-base font-medium text-muted-foreground">
                Ida solamente
              </Text>
            </Pressable>
            
            {showDatePicker && (
              <DateTimePicker
                value={fecha}
                mode="date"
                display="default"
                onChange={onChangeDate}
                minimumDate={new Date()}
              />
            )}
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          className={`h-14 mt-2 rounded-[10px] flex-row items-center justify-center ${origen && destino ? 'bg-primary' : 'bg-primary/50'}`}
          disabled={!origen || !destino}
        >
          <Text className="text-primary-foreground font-bold text-lg mr-2 uppercase tracking-wide">
            {isBoleto ? 'Buscar Boletos' : 'Enviar Paquete'}
          </Text>
          <ArrowRight color={origen && destino ? '#6b4a1a' : '#6b4a1a80'} weight="bold" size={20} />
        </Pressable>

      </View>
    </View>
  );
}
