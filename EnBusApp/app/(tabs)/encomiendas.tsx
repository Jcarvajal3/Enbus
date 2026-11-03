import { useCallback, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { DownloadSimple, Package, Plus, UploadSimple } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import { usePerfil } from '@/src/hooks/usePerfil';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
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
import { formatCity, formatDate } from '@/src/utils/formatters';
import { isEncomiendaActiva } from '@/src/utils/estados';
import { formatCedula, formatTelefono } from '@/src/utils/validation';
import type { Encomienda } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

type BuzonTab = 'recibir' | 'enviar';

export default function EncomiendasScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<BuzonTab>('recibir');
  const [isFocused, setIsFocused] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completarPerfil, setCompletarPerfil] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

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
  // usuario en un envío. El estado vacío le muestra con qué datos lo buscamos.
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
      recibir: rows.filter((e) => e.receiver_user_id === user?.id),
      enviar: rows.filter((e) => e.sender_id === user?.id),
    };
  }, [todas, user?.id]);

  const listData = buckets[tab];
  const sinDatos = (todas ?? []).length === 0;

  const renderItem = useCallback<ListRenderItem<Encomienda>>(
    ({ item, index }) => (
      <StaggerItem index={index}>
        <TransactionCard
          type={tab === 'enviar' ? 'encomienda_envio' : 'encomienda_recepcion'}
          id={item.tracking_id || item.id}
          estado={item.estado}
          titulo={
            item.ciudad_origen && item.ciudad_destino
              ? `${formatCity(item.ciudad_origen)} → ${formatCity(item.ciudad_destino)}`
              : tab === 'enviar'
                ? 'Encomienda enviada'
                : 'Encomienda para ti'
          }
          subtitulo={formatDate(item.created_at)}
          onPress={() =>
            router.push({
              pathname:
                tab === 'enviar'
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

  const emptyComponent = useMemo(
    () =>
      tab === 'enviar' ? (
        <EmptyState
          icon={UploadSimple}
          title="Aún no has enviado encomiendas"
          description="Cuando registres una encomienda, la verás aquí con su código y su seguimiento."
          action={{
            children: 'Enviar encomienda',
            icon: Plus,
            variant: 'accent',
            onPress: () => router.push('/encomiendas/nueva'),
          }}
        />
      ) : datosVinculo && (!datosVinculo.cedula || !datosVinculo.telefono) ? (
        <EmptyState
          icon={Package}
          title="No tienes encomiendas por recibir"
          description={
            // La base te encuentra por tu cédula o, si no, por tu teléfono: basta uno.
            !datosVinculo.cedula && !datosVinculo.telefono
              ? 'Para ver aquí las encomiendas que te envíen, agrega tu cédula y tu teléfono. Quien te envíe algo debe escribir los mismos datos.'
              : datosVinculo.cedula
                ? `Si alguien te envía una encomienda con tu cédula ${datosVinculo.cedula}, aparecerá aquí con su PIN de retiro. Agrega también tu teléfono para que te encuentren por cualquiera de los dos.`
                : `Si alguien te envía una encomienda con tu teléfono ${datosVinculo.telefono}, aparecerá aquí con su PIN de retiro. Agrega también tu cédula para que te encuentren por cualquiera de los dos.`
          }
          action={{ children: 'Completar mis datos', onPress: () => setCompletarPerfil(true) }}
        />
      ) : (
        <EmptyState
          icon={Package}
          title="No tienes encomiendas por recibir"
          description={
            datosVinculo
              ? `Si alguien te envía una encomienda con tu cédula ${datosVinculo.cedula} o tu teléfono ${datosVinculo.telefono}, aparecerá aquí con su PIN de retiro.`
              : 'Si alguien te envía una encomienda con tu cédula o tu teléfono, aparecerá aquí con su PIN de retiro.'
          }
          action={{
            children: 'Enviar encomienda',
            icon: Plus,
            variant: 'secondary',
            onPress: () => router.push('/encomiendas/nueva'),
          }}
        />
      ),
    [tab, router, datosVinculo]
  );

  return (
    <Screen>
      <ScreenHeader title="Mis encomiendas" subtitle="Sigue lo que envías y lo que te envían" />

      <Gutter style={{ paddingBottom: Spacing.lg }}>
        <SegmentedControl<BuzonTab>
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'recibir',
              label: 'Para mí',
              icon: DownloadSimple,
              badge: buckets.recibir.filter((e) => isEncomiendaActiva(e.estado)).length,
            },
            {
              value: 'enviar',
              label: 'Enviadas',
              icon: UploadSimple,
              badge: buckets.enviar.filter((e) => isEncomiendaActiva(e.estado)).length,
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
      ) : loading && sinDatos ? (
        <Gutter>
          <CardSkeleton count={3} />
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
              colors={[Colors.accent]}
              tintColor={Colors.accent}
            />
          }
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

      {listData.length > 0 && (
        <FloatingBar tabbed>
          <Button
            variant="gradient"
            icon={Plus}
            glow
            fullWidth
            onPress={() => router.push('/encomiendas/nueva')}
          >
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
