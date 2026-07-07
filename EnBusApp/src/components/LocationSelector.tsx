import React, { useState, useMemo, useCallback } from 'react';
import { FlatList, ListRenderItem, Modal, Pressable, TextInput as RNTextInput } from 'react-native';
import { View, Text, useCSSVariable } from '@/tw';
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
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  // PERF-08: Stable reference — avoid recreating on every render
  const normalizeText = useCallback((text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
  , []);

  const filteredLocations = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) return VENEZUELA_LOCATIONS;
    return VENEZUELA_LOCATIONS.filter((l) =>
      normalizeText(l.ciudad).includes(normalizedSearch) ||
      normalizeText(l.estado).includes(normalizedSearch)
    );
  }, [search, normalizeText]);

  // PERF-08: Stable handlers to prevent FlatList row re-renders
  const handleSelect = useCallback((loc: Localidad) => {
    onChange(loc);
    setModalVisible(false);
  }, [onChange]);

  // PERF-01: Virtualized row renderer
  const renderItem = useCallback<ListRenderItem<Localidad>>(({ item: loc, index }) => (
    <Pressable
      onPress={() => handleSelect(loc)}
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
  ), [handleSelect, filteredLocations.length]);

  const keyExtractor = useCallback((item: Localidad) => `${item.estado}-${item.ciudad}`, []);

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
              {/* BUG-08 fix: use CSS variable instead of hardcoded color */}
              <X color={foregroundColor} weight="bold" size={20} />
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

          {/* PERF-01: FlatList replaces ScrollView+map for virtualized city list (~70+ items) */}
          <FlatList
            data={filteredLocations}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={true}
            initialNumToRender={15}
            maxToRenderPerBatch={20}
            windowSize={5}
          />
        </View>
      </Modal>
    </>
  );
}
