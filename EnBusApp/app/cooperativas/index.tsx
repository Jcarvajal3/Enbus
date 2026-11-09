/**
 * cooperativas — "Cooperativas aliadas": todas las cooperativas ACTIVAS con su logo,
 * su calificación y las ciudades que cubren, con un buscador por nombre o ciudad
 * (sin tildes: "merida" encuentra "Mérida"). Tocar una abre su detalle.
 *
 * Se llega desde Inicio ("Ver todas"). ← vuelve a Inicio.
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bus, House, MagnifyingGlass, X } from 'phosphor-react-native';
import { LogoCooperativa } from '@/src/components/LogoCooperativa';
import { CalificacionCooperativa, textoCalificacion } from '@/src/components/CalificacionCooperativa';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  EmptyState,
  EntityCard,
  ErrorState,
  Field,
  Gutter,
  IconButton,
  Screen,
  ScreenHeader,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { useVolver } from '@/src/hooks/useVolver';
import {
  ciudadesDe,
  coincideBusqueda,
  precioDesde,
  resumenCiudades,
  useCooperativasAliadas,
} from '@/src/hooks/useCooperativas';
import { formatUsd } from '@/src/utils/dinero';
import type { CooperativaAliada } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

/** "12 rutas" · "1 ruta" */
const etiquetaRutas = (n: number) => (n === 1 ? '1 ruta' : `${n} rutas`);

export default function CooperativasScreen() {
  const router = useRouter();
  const volver = useVolver('/(tabs)');
  const { data, loading, error, recargar } = useCooperativasAliadas();
  const [consulta, setConsulta] = useState('');
  const [refrescando, setRefrescando] = useState(false);

  const visibles = useMemo(
    () => (data ?? []).filter((c) => coincideBusqueda(c, consulta)),
    [data, consulta]
  );

  const onRefresh = useCallback(async () => {
    setRefrescando(true);
    try {
      await recargar();
    } finally {
      setRefrescando(false);
    }
  }, [recargar]);

  const renderItem = useCallback<ListRenderItem<CooperativaAliada>>(
    ({ item, index }) => {
      const ciudades = ciudadesDe(item.rutas);
      const desde = precioDesde(item.rutas);
      const subtitulo = ciudades.length > 0 ? resumenCiudades(ciudades) : 'Aún sin rutas publicadas';
      return (
        <StaggerItem index={index}>
          <EntityCard
            leading={<LogoCooperativa nombre={item.nombre} logoUrl={item.logo_url} size="md" decorativo />}
            title={item.nombre}
            subtitle={subtitulo}
            subtitleLines={2}
            adorno={
              <CalificacionCooperativa valor={item.calificacion_promedio} total={item.total_calificaciones} />
            }
            badge={
              item.rutas.length > 0 ? (
                <Text variant="caption" weight="medium" color="muted" compact>
                  {etiquetaRutas(item.rutas.length)}
                </Text>
              ) : undefined
            }
            meta={desde !== null ? `Pasaje desde ${formatUsd(desde)}` : undefined}
            onPress={() => router.push({ pathname: '/cooperativas/[id]', params: { id: item.id } })}
            accessibilityLabel={[
              item.nombre,
              `Calificación ${textoCalificacion(item.calificacion_promedio, item.total_calificaciones)}`,
              ciudades.length > 0 ? `Cubre ${resumenCiudades(ciudades, 6)}` : 'Aún sin rutas publicadas',
              desde !== null ? `Pasaje desde ${formatUsd(desde)}` : '',
            ]
              .filter(Boolean)
              .join('. ')}
          />
        </StaggerItem>
      );
    },
    [router]
  );

  const total = data?.length ?? 0;
  const buscando = consulta.trim().length > 0;
  const errorSinDatos = !!error && data === null;

  const vacio = loading && data === null ? (
    <CardSkeleton count={5} />
  ) : errorSinDatos ? (
    <ErrorState title="No pudimos cargar las cooperativas" description={error ?? undefined} onRetry={recargar} />
  ) : total === 0 ? (
    <EmptyState
      icon={Bus}
      title="Aún no hay cooperativas"
      description="Pronto verás aquí las cooperativas que venden en EnBus."
      action={{ children: 'Volver a Inicio', icon: House, onPress: volver }}
    />
  ) : (
    <EmptyState
      icon={MagnifyingGlass}
      title="Sin resultados"
      description={`Ninguna cooperativa coincide con "${consulta.trim()}".`}
      action={{ children: 'Borrar búsqueda', icon: X, onPress: () => setConsulta('') }}
      compact
    />
  );

  return (
    <Screen>
      <ScreenHeader variant="compact" title="Cooperativas aliadas" onBack={volver} />

      <Gutter style={s.buscador}>
        <Field
          tone="light"
          icon={MagnifyingGlass}
          placeholder="Busca por nombre o ciudad"
          value={consulta}
          onChangeText={setConsulta}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Buscar cooperativa por nombre o ciudad"
          containerStyle={s.campo}
        />
        {buscando ? (
          <IconButton icon={X} variant="raised" onPress={() => setConsulta('')} label="Borrar búsqueda" />
        ) : null}
      </Gutter>

      {total > 0 ? (
        <Gutter style={s.conteo}>
          <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
            {buscando
              ? `${visibles.length} de ${total} ${total === 1 ? 'cooperativa' : 'cooperativas'}`
              : `${total} ${total === 1 ? 'cooperativa activa' : 'cooperativas activas'}`}
          </Text>
        </Gutter>
      ) : null}

      <FlatList
        data={errorSinDatos ? [] : visibles}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<View>{vacio}</View>}
        contentContainerStyle={scrollContent({ top: Spacing.sm })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={onRefresh}
            colors={[Colors.accentStrong]}
            tintColor={Colors.accentStrong}
          />
        }
        initialNumToRender={8}
        windowSize={7}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  campo: {
    flex: 1,
  },
  conteo: {
    paddingTop: Spacing.md,
  },
});
