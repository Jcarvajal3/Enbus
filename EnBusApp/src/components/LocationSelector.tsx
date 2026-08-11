import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { CaretDown, CaretUp, MagnifyingGlass, MapPin } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import {
  BottomSheet,
  EmptyState,
  Field,
  SelectField,
  Text,
} from '@/src/components/ui';
import { Localidad, VENEZUELA_LOCATIONS } from '../utils/venezuela';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

interface LocationSelectorProps {
  label: string;
  value?: Localidad | null;
  onChange: (loc: Localidad) => void;
  placeholder?: string;
  /** Render a custom trigger instead of the default `SelectField`. */
  customTrigger?: (openModal: () => void) => React.ReactNode;
}

/** Accent-insensitive, whitespace-insensitive comparison key. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function LocationSelector({
  label,
  value,
  onChange,
  placeholder,
  customTrigger,
}: LocationSelectorProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const needle = normalize(search);
    const matches = needle
      ? VENEZUELA_LOCATIONS.filter(
          (l) => normalize(l.ciudad).includes(needle) || normalize(l.estado).includes(needle)
        )
      : VENEZUELA_LOCATIONS;

    const groups = new Map<string, Localidad[]>();
    matches.forEach((loc) => {
      const list = groups.get(loc.estado) ?? [];
      list.push(loc);
      groups.set(loc.estado, list);
    });

    return Array.from(groups.keys())
      .sort((a, b) => {
        // Distrito Capital first — it's the most common origin/destination.
        if (a.toLowerCase().includes('distrito capital')) return -1;
        if (b.toLowerCase().includes('distrito capital')) return 1;
        return a.localeCompare(b, 'es');
      })
      .map((estado) => ({
        estado,
        ciudades: [...(groups.get(estado) ?? [])].sort((a, b) =>
          a.ciudad.localeCompare(b.ciudad, 'es')
        ),
      }));
  }, [search]);

  const handleSelect = useCallback(
    (loc: Localidad) => {
      onChange(loc);
      setVisible(false);
      setSearch('');
    },
    [onChange]
  );

  const open = () => setVisible(true);

  return (
    <>
      {customTrigger ? (
        customTrigger(open)
      ) : (
        <SelectField
          label={label}
          value={value ? `${value.ciudad}, ${value.estado}` : undefined}
          placeholder={placeholder ?? 'Seleccionar localidad'}
          icon={MapPin}
          onPress={open}
        />
      )}

      <BottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={`Seleccionar ${label.toLowerCase() || 'localidad'}`}
        height={Layout.sheetMaxHeight}
      >
        <View style={s.search}>
          <Field
            icon={MagnifyingGlass}
            placeholder="Buscar ciudad o estado…"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            tone="sunken"
            containerStyle={s.searchField}
            accessibilityLabel="Buscar localidad"
          />
        </View>

        <FlatList
          data={grouped}
          keyExtractor={(item) => item.estado}
          renderItem={({ item }) => (
            <StateGroup group={item} expandAll={search.trim().length > 0} onSelect={handleSelect} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={MapPin}
              title="Sin resultados"
              description={`No encontramos ciudades que coincidan con “${search}”.`}
              compact
            />
          }
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </BottomSheet>
    </>
  );
}

// ─── State group ─────────────────────────────────────────────────────────────

const StateGroup = memo(function StateGroup({
  group,
  expandAll,
  onSelect,
}: {
  group: { estado: string; ciudades: Localidad[] };
  expandAll: boolean;
  onSelect: (loc: Localidad) => void;
}) {
  const [open, setOpen] = useState(false);
  const expanded = expandAll || open;

  return (
    <View style={s.group}>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        haptic
        hapticType="selection"
        scaleValue={Motion.press.card}
        style={s.groupHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Estado ${group.estado}, ${group.ciudades.length} ciudades`}
      >
        <View style={s.groupTitle}>
          <View style={s.groupIcon}>
            <MapPin color={Colors.accent} size={Sizes.icon.md} weight="fill" />
          </View>
          <Text variant="bodyStrong" weight="bold">
            {group.estado}
          </Text>
        </View>

        {expanded ? (
          <CaretUp size={Sizes.icon.md} weight="bold" color={Colors.mutedForeground} />
        ) : (
          <CaretDown size={Sizes.icon.md} weight="bold" color={Colors.mutedForeground} />
        )}
      </PressableScale>

      {expanded && (
        <View style={s.cities}>
          {group.ciudades.map((loc, index) => (
            <PressableScale
              key={`${loc.estado}-${loc.ciudad}`}
              onPress={() => onSelect(loc)}
              haptic
              hapticType="selection"
              scaleValue={Motion.press.card}
              style={[s.city, index !== group.ciudades.length - 1 && s.cityDivided]}
              accessibilityRole="button"
              accessibilityLabel={`Ciudad ${loc.ciudad}`}
            >
              <View style={s.cityDot} />
              <Text variant="body" weight="medium">
                {loc.ciudad}
              </Text>
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  search: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
  },
  searchField: {
    marginBottom: Spacing.sm,
  },
  list: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing['4xl'],
  },
  group: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: Sizes.touchTarget + Spacing.sm,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  groupIcon: {
    width: Sizes.iconBox.sm + 2,
    height: Sizes.iconBox.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cities: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
  },
  city: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.touchTarget,
  },
  cityDivided: {
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  cityDot: {
    width: Spacing.sm - 2,
    height: Spacing.sm - 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
});
