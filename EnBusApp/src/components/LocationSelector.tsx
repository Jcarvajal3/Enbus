import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type TextInput } from 'react-native';
import {
  CaretDown,
  CaretUp,
  ClockCounterClockwise,
  MagnifyingGlass,
  MapPin,
  Star,
} from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import {
  BottomSheet,
  EmptyState,
  Field,
  SelectField,
  Text,
} from '@/src/components/ui';
import { Localidad, VENEZUELA_LOCATIONS, normalizeCityForDb } from '../utils/venezuela';
import { Colors, Layout, Motion, Opacity, Radius, Sizes, Spacing } from '@/src/theme';

interface LocationSelectorProps {
  label: string;
  value?: Localidad | null;
  onChange: (loc: Localidad) => void;
  placeholder?: string;
  /** Render a custom trigger instead of the default `SelectField`. */
  customTrigger?: (openModal: () => void) => React.ReactNode;
  /**
   * Ciudad que no se puede elegir (p. ej. el origen al elegir el destino): se
   * muestra deshabilitada con `excluirAyuda` ("Ya es tu origen").
   */
  excluir?: Localidad | null;
  excluirAyuda?: string;
  /** Sección "Recientes" (con la búsqueda vacía), p. ej. `ciudadesRecientes()`. */
  recientes?: Localidad[];
  /** Sección "Populares" (con la búsqueda vacía), p. ej. `CIUDADES_POPULARES`. */
  populares?: Localidad[];
}

/** Retraso para enfocar la búsqueda: el `Modal` tiene que estar montado (Android). */
const FOCO_DELAY_MS = Motion.duration.base;

const mismaCiudad = (a?: Localidad | null, b?: Localidad | null) =>
  !!a && !!b && normalizeCityForDb(a.ciudad) === normalizeCityForDb(b.ciudad);

const claveLocalidad = (l: Localidad) => `${l.estado}-${l.ciudad}`;

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
  excluir,
  excluirAyuda,
  recientes,
  populares,
}: LocationSelectorProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<TextInput>(null);

  // El campo de búsqueda recibe el foco al abrir (APP-15).
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => searchRef.current?.focus(), FOCO_DELAY_MS);
    return () => clearTimeout(t);
  }, [visible]);

  const esExcluida = useCallback((loc: Localidad) => mismaCiudad(loc, excluir), [excluir]);

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

  const buscando = search.trim().length > 0;
  const listaRecientes = useMemo(() => dedupe(recientes ?? []), [recientes]);
  const listaPopulares = useMemo(
    () => dedupe(populares ?? []).filter((p) => !listaRecientes.some((r) => mismaCiudad(r, p))),
    [populares, listaRecientes]
  );
  const conAtajos = !buscando && (listaRecientes.length > 0 || listaPopulares.length > 0);

  const atajos = conAtajos ? (
    <View style={s.atajos}>
      {listaRecientes.length > 0 && (
        <AtajoSeccion
          titulo="Recientes"
          icon={ClockCounterClockwise}
          ciudades={listaRecientes}
          esExcluida={esExcluida}
          excluirAyuda={excluirAyuda}
          onSelect={handleSelect}
        />
      )}
      {listaPopulares.length > 0 && (
        <AtajoSeccion
          titulo="Populares"
          icon={Star}
          ciudades={listaPopulares}
          esExcluida={esExcluida}
          excluirAyuda={excluirAyuda}
          onSelect={handleSelect}
        />
      )}
      <Text variant="overline" color="muted" uppercase style={s.seccionTitulo}>
        Por estado
      </Text>
    </View>
  ) : null;

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
            ref={searchRef}
            icon={MagnifyingGlass}
            placeholder="Buscar ciudad o estado…"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            tone="sunken"
            containerStyle={s.searchField}
            accessibilityLabel="Buscar ciudad o estado"
            returnKeyType="search"
          />
        </View>

        <FlatList
          data={grouped}
          keyExtractor={(item) => item.estado}
          ListHeaderComponent={atajos}
          renderItem={({ item }) => (
            <StateGroup
              group={item}
              expandAll={buscando}
              onSelect={handleSelect}
              esExcluida={esExcluida}
              excluirAyuda={excluirAyuda}
            />
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

function dedupe(lista: Localidad[]): Localidad[] {
  const vistas = new Set<string>();
  return lista.filter((l) => {
    const clave = normalizeCityForDb(l.ciudad);
    if (!clave || vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

// ─── Recientes y populares ───────────────────────────────────────────────────

function AtajoSeccion({
  titulo,
  icon: Icon,
  ciudades,
  esExcluida,
  excluirAyuda,
  onSelect,
}: {
  titulo: string;
  icon: typeof MapPin;
  ciudades: Localidad[];
  esExcluida: (loc: Localidad) => boolean;
  excluirAyuda?: string;
  onSelect: (loc: Localidad) => void;
}) {
  return (
    <View style={s.seccion}>
      <View style={s.seccionCabecera}>
        <Icon size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
        <Text variant="overline" color="muted" uppercase>
          {titulo}
        </Text>
      </View>
      <View style={s.pills}>
        {ciudades.map((loc) => {
          const deshabilitada = esExcluida(loc);
          return (
            <PressableScale
              key={claveLocalidad(loc)}
              // Sin `disabled`: PressableScale atenuaría también la ayuda y no se leería bien.
              onPress={deshabilitada ? undefined : () => onSelect(loc)}
              haptic={!deshabilitada}
              hapticType="selection"
              scaleValue={Motion.press.chip}
              style={[s.pill, deshabilitada && s.pillOff]}
              accessibilityRole="button"
              accessibilityLabel={`${loc.ciudad}, ${loc.estado}${
                deshabilitada && excluirAyuda ? `. ${excluirAyuda}` : ''
              }`}
              accessibilityState={{ disabled: deshabilitada }}
            >
              <Text variant="label" weight="bold" color={deshabilitada ? 'muted' : 'foreground'} compact>
                {loc.ciudad}
              </Text>
              {deshabilitada && excluirAyuda ? (
                <Text variant="caption" color="muted" compact>
                  {excluirAyuda}
                </Text>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const StateGroup = memo(function StateGroup({
  group,
  expandAll,
  onSelect,
  esExcluida,
  excluirAyuda,
}: {
  group: { estado: string; ciudades: Localidad[] };
  expandAll: boolean;
  onSelect: (loc: Localidad) => void;
  esExcluida: (loc: Localidad) => boolean;
  excluirAyuda?: string;
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
          {group.ciudades.map((loc, index) => {
            const deshabilitada = esExcluida(loc);
            return (
              <PressableScale
                key={claveLocalidad(loc)}
                onPress={deshabilitada ? undefined : () => onSelect(loc)}
                haptic={!deshabilitada}
                hapticType="selection"
                scaleValue={Motion.press.card}
                style={[s.city, index !== group.ciudades.length - 1 && s.cityDivided]}
                accessibilityRole="button"
                accessibilityLabel={`Ciudad ${loc.ciudad}${
                  deshabilitada && excluirAyuda ? `. ${excluirAyuda}` : ''
                }`}
                accessibilityState={{ disabled: deshabilitada }}
              >
                <View style={[s.cityDot, deshabilitada && s.cityDotOff]} />
                <Text
                  variant="body"
                  weight="medium"
                  color={deshabilitada ? 'muted' : 'foreground'}
                  style={s.cityName}
                >
                  {loc.ciudad}
                </Text>
                {deshabilitada && excluirAyuda ? (
                  <Text variant="caption" color="muted">
                    {excluirAyuda}
                  </Text>
                ) : null}
              </PressableScale>
            );
          })}
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
  cityDotOff: {
    backgroundColor: Colors.mutedForeground,
    opacity: Opacity.disabled,
  },
  cityName: {
    flex: 1,
  },
  atajos: {
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  seccion: {
    gap: Spacing.sm,
  },
  seccionCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  seccionTitulo: {
    marginTop: Spacing.xs,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    minHeight: Sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  pillOff: {
    backgroundColor: Colors.transparent,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
});
