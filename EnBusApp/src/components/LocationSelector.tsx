import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { VENEZUELA_LOCATIONS, Localidad } from '../utils/venezuela';
import { MapPin, X, MagnifyingGlass, CaretDown, CaretUp } from 'phosphor-react-native';
import { Colors, Typography, Radius, Spacing } from '@/src/theme';
import { PressableScale } from './PressableScale';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface StateAccordionProps {
  item: { estado: string; ciudades: Localidad[] };
  search: string;
  handleSelect: (loc: Localidad) => void;
}

// Collapsible State group component extracted to module level (P2-13 fix)
const StateAccordion = memo(({ item, search, handleSelect }: StateAccordionProps) => {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = search.trim().length > 0 || localExpanded;

  return (
    <View style={s.accordionGroup}>
      {/* State Title Row */}
      <Pressable
        onPress={() => setLocalExpanded(!localExpanded)}
        style={s.accordionHeader}
        accessibilityRole="button"
        accessibilityLabel={`Estado ${item.estado}, ${isExpanded ? 'contraer' : 'expandir'}`}
      >
        <View style={s.accordionTitleLeft}>
          <View style={s.accordionIconCircle}>
            <MapPin color={Colors.accent} size={16} weight="fill" />
          </View>
          <Text style={s.stateText}>{item.estado}</Text>
        </View>
        {isExpanded ? (
          <CaretUp size={18} weight="bold" color={Colors.foreground} />
        ) : (
          <CaretDown size={18} weight="bold" color={Colors.foreground} />
        )}
      </Pressable>

      {/* Cities nested list */}
      {isExpanded && (
        <View style={s.citiesList}>
          {item.ciudades.map((loc, idx) => (
            <Pressable
              key={`${loc.estado}-${loc.ciudad}`}
              onPress={() => handleSelect(loc)}
              style={[
                s.cityRow,
                idx !== item.ciudades.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Ciudad ${loc.ciudad}`}
            >
              <View style={s.cityDot} />
              <Text style={s.cityText}>{loc.ciudad}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});
StateAccordion.displayName = 'StateAccordion';

interface LocationSelectorProps {
  label: string;
  value?: Localidad | null;
  onChange: (loc: Localidad) => void;
  placeholder?: string;
  customTrigger?: (openModal: () => void) => React.ReactNode;
}

export function LocationSelector({
  label,
  value,
  onChange,
  placeholder,
  customTrigger,
}: LocationSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  
  // Pan gesture for swiping down to close
  const translateY = useRef(new Animated.Value(0)).current;

  const handleClose = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
    });
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture only downward swipe movements
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.4) {
          handleClose();
        } else {
          // Snap back to open position
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 45,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const normalizeText = useCallback((text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
  , []);

  // Filter locations first
  const filteredLocations = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) return VENEZUELA_LOCATIONS;
    return VENEZUELA_LOCATIONS.filter((l) =>
      normalizeText(l.ciudad).includes(normalizedSearch) ||
      normalizeText(l.estado).includes(normalizedSearch)
    );
  }, [search, normalizeText]);

  // Group by State
  const groupedLocations = useMemo(() => {
    const groups: { [estado: string]: Localidad[] } = {};
    filteredLocations.forEach((loc) => {
      if (!groups[loc.estado]) {
        groups[loc.estado] = [];
      }
      groups[loc.estado].push(loc);
    });

    const sortedStates = Object.keys(groups).sort((a, b) => {
      const isCapitalA = a.toLowerCase().includes('distrito capital');
      const isCapitalB = b.toLowerCase().includes('distrito capital');
      if (isCapitalA) return -1;
      if (isCapitalB) return 1;
      return a.localeCompare(b, 'es');
    });

    return sortedStates.map((estado) => {
      const sortedCiudades = [...groups[estado]].sort((a, b) =>
        a.ciudad.localeCompare(b.ciudad, 'es')
      );
      return {
        estado,
        ciudades: sortedCiudades,
      };
    });
  }, [filteredLocations]);

  const handleSelect = useCallback((loc: Localidad) => {
    onChange(loc);
    setModalVisible(false);
  }, [onChange]);

  const handleOpen = () => {
    translateY.setValue(0);
    setModalVisible(true);
  };

  return (
    <>
      {customTrigger ? customTrigger(handleOpen) : (
        <View style={s.container}>
          <Text style={s.inputLabel}>{label}</Text>
          <Pressable
            onPress={handleOpen}
            style={s.inputBox}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value ? `${value.ciudad}, ${value.estado}` : placeholder || 'Seleccionar localidad'}`}
          >
            <MapPin color={Colors.mutedForeground} weight="bold" size={20} />
            {value ? (
              <Text style={s.inputValue}>
                {value.ciudad}, {value.estado}
              </Text>
            ) : (
              <Text style={s.inputPlaceholder}>
                {placeholder || 'Seleccionar localidad...'}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleClose}
      >
        <View style={s.overlay}>
          <Animated.View
            style={[
              s.sheet,
              { transform: [{ translateY }] },
            ]}
          >
            {/* Draggable Header */}
            <View {...panResponder.panHandlers} style={s.sheetHeader}>
              <View style={s.dragHandle} />
              <View style={s.headerContent}>
                <Text style={s.headerTitle}>Seleccionar {label}</Text>
                <PressableScale
                  onPress={handleClose}
                  style={s.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar modal"
                >
                  <X color={Colors.foreground} weight="bold" size={20} />
                </PressableScale>
              </View>
            </View>

            {/* Search Input */}
            <View style={s.searchSection}>
              <View style={s.searchBox}>
                <MagnifyingGlass color={Colors.mutedForeground} weight="bold" size={20} />
                <RNTextInput
                  style={s.searchInput}
                  placeholder="Buscar ciudad o estado..."
                  placeholderTextColor={Colors.mutedForeground}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                  accessibilityLabel="Campo de búsqueda de localidad"
                />
              </View>
            </View>

            {/* Grouped Accordions list */}
            <FlatList
              data={groupedLocations}
              renderItem={({ item }) => (
                <StateAccordion
                  item={item}
                  search={search}
                  handleSelect={handleSelect}
                />
              )}
              keyExtractor={(item) => item.estado}
              contentContainerStyle={s.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    textTransform: 'uppercase',
  },
  inputBox: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 0,
  },
  inputValue: {
    fontSize: Typography.sizes.base,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginLeft: Spacing.md,
  },
  inputPlaceholder: {
    fontSize: Typography.sizes.base,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    marginLeft: Spacing.md,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '85%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: Typography.sizes.xl - 1,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  searchSection: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
  },
  searchBox: {
    backgroundColor: Colors.surface,
    height: 48,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    marginLeft: Spacing.sm + 2,
    fontSize: Typography.sizes.base,
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  listContent: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
  },
  accordionGroup: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg - 2,
    paddingHorizontal: Spacing.lg,
  },
  accordionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  accordionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    fontSize: Typography.sizes.base,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  citiesList: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg - 2,
  },
  cityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginRight: Spacing.md,
  },
  cityText: {
    fontSize: Typography.sizes.base,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.medium,
    color: Colors.foreground,
  },
});
