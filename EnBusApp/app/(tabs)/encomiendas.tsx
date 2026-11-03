import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { DownloadSimple, Package, UploadSimple } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import { usePerfil } from '@/src/hooks/usePerfil';
import { TransactionCard } from '@/src/components/TransactionCard';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import { HeaderActions } from '@/src/components/HeaderActions';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Button,
  EmptyState,
  ErrorState,
  FloatingBar,
  Gutter,
  Screen,
  ScreenHeader,
  SegmentedControl,
  StaleBanner,
  scrollContent,
} from '@/src/components/ui';
import { formatCity, formatDiaVE } from '@/src/utils/formatters';
import { isEncomiendaActiva } from '@/src/utils/estados';
import { formatCedula, formatTelefono } from '@/src/utils/validation';
import type { Encomienda } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

/**
 * Segmentos del buzón. El valor es el de `?vista=` (§3.5): el fin del asistente
 * abre "Enviadas" y la ← de cada detalle vuelve a su segmento.
 */
type Vista = 'enviadas' | 'para-mi';

const esVista = (v: unknown): v is Vista => v === 'enviadas' || v === 'para-mi';

export default function EncomiendasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { vista } = useLocalSearchParams<{ vista?: string }>();

  const [tab, setTab] = useState<Vista>(esVista(vista) ? vista : 'enviadas');
  /** El segmento ya lo decidió la URL o el usuario: los datos no lo cambian. */
  const decidido = useRef(esVista(vista));
  const [isFocused, setIsFocused] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completarPerfil, setCompletarPerfil] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  // `?vista=` manda cada vez que cambia (fin del asistente, ← de un detalle).
  useEffect(() => {
    if (!esVista(vista)) return;
    decidido.current = true;
    setTab(vista);
  }, [vista]);

  const {
    data: todas,
    loading,
    error,
    actualizadoAt,
    refetch,
  } = useEncomiendas(user?.id, {
    enabled: isFocused && !!user?.id,
    limit: 30,
  });

  // M-50: "Para mí" se llena cuando la base reconoce la cédula o el teléfono del
  // usuario en un envío. El vacío dice con qué datos lo encuentran.
  // `usePerfil` ya oculta los marcadores PENDIENTE-… del alta con Google.
  const { perfil, loading: cargandoPerfil } = usePerfil();
  const datosVinculo = useMemo(() => {
    if (cargandoPerfil || !perfil) return null;
    const cedula = formatCedula(perfil.cedula_rif);
    const telefono = formatTelefono(perfil.telefono);
    return {
      cedula: cedula === '—' ? null : cedula,
      telefono: telefono === '—' ? null : telefono,
    };
  }, [perfil, cargandoPerfil]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const buckets = useMemo(() => {
    const rows: Encomienda[] = todas ?? [];
    return {
      enviadas: rows.filter((e) => e.sender_id === user?.id),
      'para-mi': rows.filter((e) => e.receiver_user_id === user?.id),
    } satisfies Record<Vista, Encomienda[]>;
  }, [todas, user?.id]);

  const activas = useMemo(
    () => ({
      enviadas: buckets.enviadas.filter((e) => isEncomiendaActiva(e.estado)).length,
      'para-mi': buckets['para-mi'].filter((e) => isEncomiendaActiva(e.estado)).length,
    }),
    [buckets]
  );

  const sinDatos = (todas ?? []).length === 0;

  // AN-06: sin `?vista=`, abre el segmento que tiene encomiendas activas.
  useEffect(() => {
    if (decidido.current || sinDatos) return;
    decidido.current = true;
    setTab(activas.enviadas === 0 && activas['para-mi'] > 0 ? 'para-mi' : 'enviadas');
  }, [sinDatos, activas]);

  const cambiarVista = useCallback(
    (v: Vista) => {
      decidido.current = true;
      setTab(v);
      // La URL sigue al segmento: un `?vista=` nuevo siempre se nota.
      router.setParams({ vista: v });
    },
    [router]
  );

  const listData = buckets[tab];
  const enviar = useCallback(() => router.push('/encomiendas/nueva'), [router]);

  const renderItem = useCallback<ListRenderItem<Encomienda>>(
    ({ item, index }) => (
      <StaggerItem index={index}>
        <TransactionCard
          type={tab === 'enviadas' ? 'encomienda_envio' : 'encomienda_recepcion'}
          id={item.tracking_id || item.id}
          estado={item.estado}
          titulo={
            item.ciudad_origen && item.ciudad_destino
              ? `${formatCity(item.ciudad_origen)} → ${formatCity(item.ciudad_destino)}`
              : 'Encomienda'
          }
          subtitulo={item.created_at ? `Creada ${formatDiaVE(item.created_at)}` : ''}
          onPress={() =>
            router.push({
              pathname:
                tab === 'enviadas'
                  ? ('/encomiendas/enviar/[id]' as const)
                  : ('/encomiendas/recibir/[id]' as const),
              params: { id: item.id },
            })
          }
        />
      </StaggerItem>
    ),
    [tab, router]
  );

  const accionEnviar = { children: 'Enviar encomienda', icon: Package, onPress: enviar };

  const emptyComponent =
    tab === 'enviadas' ? (
      <EmptyState
        icon={UploadSimple}
        title="Nada enviado todavía"
        description="Genera el código y lleva la encomienda a la taquilla."
        action={accionEnviar}
      />
    ) : datosVinculo && (!datosVinculo.cedula || !datosVinculo.telefono) ? (
      <EmptyState
        icon={DownloadSimple}
        title="Nada para ti todavía"
        description={
          datosVinculo.cedula || datosVinculo.telefono
            ? `Te encuentran por ${datosVinculo.cedula ?? datosVinculo.telefono}`
            : 'Agrega tu cédula y tu teléfono para que te encuentren'
        }
        action={{ children: 'Completar mis datos', onPress: () => setCompletarPerfil(true) }}
      />
    ) : (
      <EmptyState
        icon={DownloadSimple}
        title="Nada para ti todavía"
        description={
          datosVinculo
            ? `Te encuentran por ${datosVinculo.cedula} o ${datosVinculo.telefono}`
            : 'Te encuentran por tu cédula o tu teléfono'
        }
        action={accionEnviar}
      />
    );

  return (
    <Screen>
      <ScreenHeader title="Mis encomiendas" right={<HeaderActions />} />

      {loading && sinDatos && !error ? (
        <ScreenSkeleton variante="lista" />
      ) : (
        <>
          <Gutter style={{ paddingBottom: Spacing.lg }}>
            <SegmentedControl<Vista>
              value={tab}
              onChange={cambiarVista}
              options={[
                {
                  value: 'enviadas',
                  label: 'Enviadas',
                  icon: UploadSimple,
                  badge: activas.enviadas,
                },
                {
                  value: 'para-mi',
                  label: 'Para mí',
                  icon: DownloadSimple,
                  badge: activas['para-mi'],
                },
              ]}
            />
          </Gutter>

          {error && sinDatos ? (
            // APP-37: sin datos y con error no es "no tienes encomiendas".
            <Gutter>
              <ErrorState
                title="No pudimos cargar tus encomiendas"
                description={error}
                onRetry={refetch}
              />
            </Gutter>
          ) : (
            <FlatList
              data={listData}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                error ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={() => refetch()} /> : null
              }
              ListEmptyComponent={emptyComponent}
              contentContainerStyle={scrollContent({
                tabbed: true,
                floatingAction: listData.length > 0,
                top: 0,
              })}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[Colors.mutedForeground]}
                  tintColor={Colors.mutedForeground}
                />
              }
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
            />
          )}
        </>
      )}

      {listData.length > 0 && (
        <FloatingBar tabbed>
          <Button icon={Package} fullWidth onPress={enviar}>
            Enviar encomienda
          </Button>
        </FloatingBar>
      )}

      <CompletarPerfilSheet
        visible={completarPerfil}
        motivo="perfil"
        onClose={() => setCompletarPerfil(false)}
        onCompletado={() => {
          setCompletarPerfil(false);
          // La base vincula los envíos con la cédula o el teléfono nuevos.
          refetch();
        }}
      />
    </Screen>
  );
}
