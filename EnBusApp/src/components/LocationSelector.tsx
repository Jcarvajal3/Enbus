/**
 * LocationSelector — hoja para elegir una ciudad (origen o destino).
 *
 * Título de la hoja = el campo ("Origen" / "Destino"); arriba "Recientes" y
 * "Populares" en píldoras, luego las ciudades agrupadas por estado. Las filas
 * no llevan icono (AU-31): el nombre basta. La búsqueda no toma el foco al abrir:
 * el teclado saltaba en plena animación y la hoja parpadeaba, y además tapaba los
 * atajos, que resuelven la mayoría de las búsquedas. `opciones` limita las ciudades (p.
 * ej. solo las que tienen ruta); `excluir` muestra una deshabilitada con su
 * motivo ("Ya es tu origen").
 *
 * Sin `opciones` se ofrece el catálogo compartido (`VENEZUELA_LOCATIONS`, el mismo
 * del panel) más cualquier ciudad de una ruta activa que no esté en él: una ruta
 * nueva nunca queda sin poder elegirse en la app.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { CaretDown, CaretUp, MagnifyingGlass, MapPin } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import {
  BottomSheet,
  EmptyState,
  Field,
  SectionLabel,
  SelectField,
  Text,
} from '@/src/components/ui';
import {
  Localidad,
  VENEZUELA_LOCATIONS,
  localidadDeDb,
  normalizeCityForDb,
  unirLocalidades,
} from '../utils/venezuela';
import { supabase } from '../utils/supabase';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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
  /** Ciudades que se ofrecen. Por defecto, todo el catálogo. */
  opciones?: Localidad[];
}

const mismaCiudad = (a?: Localidad | null, b?: Localidad | null) =>
  !!a && !!b && normalizeCityForDb(a.ciudad) === normalizeCityForDb(b.ciudad);

const claveLocalidad = (l: Localidad) => `${l.estado}-${l.ciudad}`;

/** Grupo de las ciudades de una ruta que no traen estado. */
const SIN_ESTADO = 'Otras ciudades';

// ─── Ciudades de las rutas activas ───────────────────────────────────────────

/** Las ciudades de las rutas se vuelven a leer como mucho cada 10 minutos. */
const VIGENCIA_RUTAS_MS = 10 * 60 * 1000;
let rutasCache: { at: number; lista: Localidad[] } | null = null;
let rutasEnCurso: Promise<Localidad[]> | null = null;

/**
 * Orígenes y destinos de las rutas activas (de cooperativas activas) que no están
 * en el catálogo, como `Localidad` con su nombre legible. Una sola consulta para
 * todos los selectores abiertos; ante un error devuelve [] (queda el catálogo).
 */
function localidadesDeRutas(): Promise<Localidad[]> {
  if (rutasCache && Date.now() - rutasCache.at < VIGENCIA_RUTAS_MS) {
    return Promise.resolve(rutasCache.lista);
  }
  if (rutasEnCurso) return rutasEnCurso;
  rutasEnCurso = (async () => {
    try {
      const { data, error } = await supabase
        .from('rutas')
        .select(
          'estado_origen, ciudad_origen, estado_destino, ciudad_destino, cooperativas!inner ( estado )'
        )
        // Sin filtro de precio: el selector sirve también a encomiendas, y una ruta
        // de solo encomiendas (sin pasaje) es válida allí.
        .eq('activa', true)
        .eq('cooperativas.estado', 'ACTIVA')
        .limit(1000);
      if (error) throw error;
      const encontradas: Localidad[] = [];
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
        // Sin estado no se puede registrar una encomienda (la validación compara el
        // estado con la ruta): esas ciudades se dejan fuera.
        const origen = texto(r.estado_origen)
          ? localidadDeDb(texto(r.ciudad_origen), texto(r.estado_origen))
          : null;
        const destino = texto(r.estado_destino)
          ? localidadDeDb(texto(r.ciudad_destino), texto(r.estado_destino))
          : null;
        if (origen) encontradas.push(origen);
        if (destino) encontradas.push(destino);
      }
      const lista = unirLocalidades(VENEZUELA_LOCATIONS, encontradas).slice(
        VENEZUELA_LOCATIONS.length
      );
      rutasCache = { at: Date.now(), lista };
      return lista;
    } catch {
      return [];
    } finally {
      rutasEnCurso = null;
    }
  })();
  return rutasEnCurso;
}

/** Catálogo + ciudades de rutas activas que faltan en él. Con `activo` en false, solo el catálogo. */
function useCatalogoConRutas(activo: boolean): Localidad[] {
  const [extra, setExtra] = useState<Localidad[]>(() => rutasCache?.lista ?? []);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void localidadesDeRutas().then((lista) => {
      if (vivo) setExtra((antes) => (antes === lista ? antes : lista));
    });
    return () => {
      vivo = false;
    };
  }, [activo]);
  return useMemo(() => unirLocalidades(VENEZUELA_LOCATIONS, extra), [extra]);
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
  excluir,
  excluirAyuda,
  recientes,
  populares,
  opciones,
}: LocationSelectorProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const esExcluida = useCallback((loc: Localidad) => mismaCiudad(loc, excluir), [excluir]);
  const catalogoCompleto = useCatalogoConRutas(!opciones);

  const grouped = useMemo(() => {
    const needle = normalize(search);
    const catalogo = opciones ?? catalogoCompleto;
    const matches = needle
      ? catalogo.filter(
          (l) => normalize(l.ciudad).includes(needle) || normalize(l.estado).includes(needle)
        )
      : catalogo;

    const groups = new Map<string, Localidad[]>();
    matches.forEach((loc) => {
      const estado = loc.estado || SIN_ESTADO;
      const list = groups.get(estado) ?? [];
      list.push(loc);
      groups.set(estado, list);
    });

    return Array.from(groups.keys())
      .sort((a, b) => {
        // Distrito Capital first — it's the most common origin/destination.
        if (a.toLowerCase().includes('distrito capital')) return -1;
        if (b.toLowerCase().includes('distrito capital')) return 1;
        // Las ciudades sin estado, al final.
        if (a === SIN_ESTADO) return 1;
        if (b === SIN_ESTADO) return -1;
        return a.localeCompare(b, 'es');
      })
      .map((estado) => ({
        estado,
        ciudades: [...(groups.get(estado) ?? [])].sort((a, b) =>
          a.ciudad.localeCompare(b.ciudad, 'es')
        ),
      }));
  }, [search, opciones, catalogoCompleto]);

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
  // Con `opciones`, los atajos solo muestran ciudades que se pueden elegir.
  const disponible = useCallback(
    (l: Localidad) => !opciones || opciones.some((o) => mismaCiudad(o, l)),
    [opciones]
  );
  const listaRecientes = useMemo(
    () => dedupe(recientes ?? []).filter(disponible),
    [recientes, disponible]
  );
  const listaPopulares = useMemo(
    () =>
      dedupe(populares ?? [])
        .filter(disponible)
        .filter((p) => !listaRecientes.some((r) => mismaCiudad(r, p))),
    [populares, listaRecientes, disponible]
  );
  const conAtajos = !buscando && (listaRecientes.length > 0 || listaPopulares.length > 0);

  const atajos = conAtajos ? (
    <View style={s.atajos}>
      {listaRecientes.length > 0 && (
        <AtajoSeccion
          titulo="Recientes"
          ciudades={listaRecientes}
          esExcluida={esExcluida}
          excluirAyuda={excluirAyuda}
          onSelect={handleSelect}
        />
      )}
      {listaPopulares.length > 0 && (
        <AtajoSeccion
          titulo="Populares"
          ciudades={listaPopulares}
          esExcluida={esExcluida}
          excluirAyuda={excluirAyuda}
          onSelect={handleSelect}
        />
      )}
      <SectionLabel style={s.seccionTitulo}>Por estado</SectionLabel>
    </View>
  ) : null;

  return (
    <>
      {customTrigger ? (
        customTrigger(open)
      ) : (
        <SelectField
          label={label}
          value={value ? (value.estado ? `${value.ciudad}, ${value.estado}` : value.ciudad) : undefined}
          placeholder={placeholder ?? 'Elige la ciudad'}
          icon={MapPin}
          onPress={open}
        />
      )}

      <BottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={label || 'Ciudad'}
        height={Layout.sheetMaxHeight}
      >
        <View style={s.search}>
          <Field
            icon={MagnifyingGlass}
            placeholder="Busca tu ciudad o estado"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
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
  ciudades,
  esExcluida,
  excluirAyuda,
  onSelect,
}: {
  titulo: string;
  ciudades: Localidad[];
  esExcluida: (loc: Localidad) => boolean;
  excluirAyuda?: string;
  onSelect: (loc: Localidad) => void;
}) {
  return (
    <View>
      <SectionLabel style={s.seccionCabecera}>{titulo}</SectionLabel>
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
              <Text variant="label" weight="semibold" color={deshabilitada ? 'muted' : 'infoText'} compact>
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
        <Text variant="bodyStrong" style={s.groupTitle}>
          {group.estado}
        </Text>

        {expanded ? (
          <CaretUp size={Sizes.icon.sm} weight="bold" color={Colors.accentStrong} />
        ) : (
          <CaretDown size={Sizes.icon.sm} weight="bold" color={Colors.placeholder} />
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
    paddingTop: Spacing.xs,
  },
  searchField: {
    marginBottom: Spacing.md,
  },
  list: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing['4xl'],
  },
  group: {
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    minHeight: Sizes.control.lg,
  },
  groupTitle: {
    flex: 1,
  },
  cities: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  city: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.control.md,
  },
  cityDivided: {
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.surfaceDark,
  },
  cityName: {
    flex: 1,
  },
  atajos: {
    gap: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  seccionCabecera: {
    marginBottom: Spacing.md,
  },
  seccionTitulo: {
    marginTop: Spacing.xs,
    marginBottom: 0,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    minHeight: Sizes.control.sm,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentLight,
  },
  pillOff: {
    backgroundColor: Colors.surface,
  },
});
