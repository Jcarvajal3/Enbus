import React, { useState, useMemo } from 'react';
import { Modal, Pressable, TextInput as RNTextInput } from 'react-native';
import { View, Text, ScrollView } from '@/tw';
import { VENEZUELA_LOCATIONS, Localidad } from '../utils/venezuela';
import { MapPin, X, MagnifyingGlass } from 'phosphor-react-native';

interface LocationSelectorProps {
  label: string;
  value?: Localidad | null;
  onChange: (loc: Localidad) => void;
  placeholder?: string;
  customTrigger?: (openModal: () => void) => React.ReactNode;
}

export function LocationSelector({ label, value, onChange, placeholder, customTrigger }: LocationSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const normalizeText = (text: string) => {
    return text
      .normalize('NFD') // Descompone caracteres con acentos
      .replace(/[\u0300-\u036f]/g, '') // Elimina los diacríticos (acentos)
      .replace(/\s+/g, '') // Elimina los espacios
      .toLowerCase(); // Convierte a minúsculas
  };

  const filteredLocations = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) return VENEZUELA_LOCATIONS;

    return VENEZUELA_LOCATIONS.filter((l) =>
      normalizeText(l.ciudad).includes(normalizedSearch) ||
      normalizeText(l.estado).includes(normalizedSearch)
    );
  }, [search]);

  return (
    <>
      {customTrigger ? customTrigger(() => setModalVisible(true)) : (
        <View className="mb-4">
          <Text className="text-xs font-bold text-muted-foreground mb-2 ml-1 uppercase">
            {label}
          </Text>
          <Pressable
            onPress={() => setModalVisible(true)}
            style={{
              backgroundColor: '#ffffff',
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              height: 48,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#d4d4d8',
            }}
          >
            <MapPin color="#a3a3a3" weight="bold" size={20} />
            {value ? (
              <Text className="text-base font-bold text-foreground ml-3">
                {value.ciudad}, {value.estado}
              </Text>
            ) : (
              <Text className="text-base font-medium text-muted-foreground ml-3">
                {placeholder || 'Seleccionar localidad...'}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Modal animationType="slide" presentationStyle="pageSheet" visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-background pt-6">
          <View className="flex-row justify-between items-center px-6 pb-4 border-b border-border/50">
            <Text className="text-xl font-bold text-foreground">Seleccionar {label}</Text>
            <Pressable onPress={() => setModalVisible(false)} className="size-10 bg-secondary rounded-full items-center justify-center">
              <X color="#171717" weight="bold" size={20} />
            </Pressable>
          </View>

          <View className="px-6 py-4">
            <View style={{
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#d4d4d8',
              height: 48,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
            }}>
              <MagnifyingGlass color="#a3a3a3" weight="bold" size={20} />
              <RNTextInput
                style={{ flex: 1, height: '100%', marginLeft: 8, fontSize: 15, color: '#171717' }}
                placeholder="Buscar ciudad o estado..."
                placeholderTextColor="#a3a3a3"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>

          <ScrollView className="flex-1 px-6">
            {filteredLocations.map((loc, index) => (
              <Pressable
                key={`${loc.estado}-${loc.ciudad}`}
                onPress={() => {
                  onChange(loc);
                  setModalVisible(false);
                }}
                style={[
                  { paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
                  index !== filteredLocations.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#e5e5e5' }
                ]}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fdf5d3', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin color="#d4a017" weight="fill" size={20} />
                </View>
                <View className="ml-4">
                  <Text className="text-base font-bold text-foreground">{loc.ciudad}</Text>
                  <Text className="text-sm font-medium text-muted-foreground">{loc.estado}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
