import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Bus, CheckCircle, ClockCountdown } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
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
import { formatCity } from '@/src/utils/formatters';
import { formatCodigoBoleto } from '@/src/utils/codigos';
import { humanizeError } from '@/src/utils/errores';
import {
  BOLETO_ESTADOS_ACTIVOS,
  BOLETO_ESTADOS_HISTORIAL,
  getEstadoBoletoUi,
  getEstadoReembolso,
} from '@/src/utils/estados';
import { formatSalidaCorta } from '@/src/hooks/useCheckoutBoletos';
import type { PagoBoletoEmbed } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

type TabType = 'activos' | 'historial';

interface BoletoRow {
  id: string;
  codigo_boleto?: string;
  asiento?: string;
  estado: string;
  created_at: string;
  monto_reembolso?: number | null;
  reembolso_procesado?: boolean | null;
  viajes?: {
    fecha_hora_salida?: string;
    rutas?: { ciudad_origen?: string; ciudad_destino?: string };
  };
  /** Embed del último pago de la compra: separa "Sin pagar" de "Pago en verificación" */
  pago?: PagoBoletoEmbed | PagoBoletoEmbed[] | null;
}

/**
 * Tras la migración 01 hay dos relaciones boletos↔pagos: el embed lleva el hint
 * de la FK `boletos.pago_id`. `monto_reembolso` y `reembolso_procesado` dan el
 * estado del reembolso de un boleto cancelado ("Reembolso pendiente").
 */
const SELECT_BOLETOS = `id, codigo_boleto, asiento, estado, created_at, compra_id, reserva_expira_at,
  monto_reembolso, reembolso_procesado,
  viajes ( fecha_hora_salida, rutas ( ciudad_origen, ciudad_destino ) ),
  pago:pagos!boletos_pago_id_fkey ( id, estado_verificacion, tipo_pago, motivo_rechazo,
    numero_referencia, banco_emisor, monto, monto_bs, moneda, monto_declarado,
    tasa_bcv, tasa_bcv_fecha, created_at )`;

/** "Asiento 14 · Sale vie. 04/10 · 8:30 a. m." (la salida, no la fecha de compra). */
function subtituloBoleto(b: BoletoRow): string {
  const salida = b.viajes?.fecha_hora_salida;
  const partes: string[] = [];
  if (b.asiento) partes.push(`Asiento ${b.asiento}`);
  partes.push(salida ? `Sale ${formatSalidaCorta(salida)}` : 'Salida por confirmar');
  return partes.join(' · ');
}

/** Estado de la insignia: el de la reserva/pago, o el del reembolso si se canceló pagado. */
function estadoParaInsignia(b: BoletoRow): string {
  const reembolso = getEstadoReembolso(b);
  if (reembolso === 'PENDIENTE') return 'REEMBOLSO_PENDIENTE';
  if (reembolso === 'PROCESADO') return 'REEMBOLSADO';
  return getEstadoBoletoUi(b) ?? b.estado;
}

export default function BoletosScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [isFocused, setIsFocused] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('activos');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const {
    data: historial,
    loading,
    error,
    refetch,
    actualizadoAt,
  } = useRealtime<BoletoRow>('boletos', 'comprador_id', user?.id, SELECT_BOLETOS, {
    enabled: isFocused && !!user?.id,
    limit: 30,
  });

  // Realtime entrega la fila sin embeds (sin viaje ni pago): el estado que ve el
  // usuario depende del pago, así que se vuelve a leer la lista completa. Una
  // sola recarga a la vez para no entrar en bucle con la caché.
  const recargandoRef = useRef(false);
  useEffect(() => {
    const incompletas = (historial ?? []).some((b) => !('viajes' in b));
    if (!incompletas) {
      recargandoRef.current = false;
      return;
    }
    if (recargandoRef.current || !isFocused) return;
    recargandoRef.current = true;
    void refetch();
  }, [historial, isFocused, refetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const counts = useMemo(() => {
    const rows = historial ?? [];
    return {
      activos: rows.filter((b) => (BOLETO_ESTADOS_ACTIVOS as readonly string[]).includes(b.estado))
        .length,
      historial: rows.filter((b) =>
        (BOLETO_ESTADOS_HISTORIAL as readonly string[]).includes(b.estado)
      ).length,
    };
  }, [historial]);

  const filteredData = useMemo(() => {
    if (!historial) return [];
    const target =
      activeTab === 'activos' ? BOLETO_ESTADOS_ACTIVOS : BOLETO_ESTADOS_HISTORIAL;
    return historial.filter((b) => (target as readonly string[]).includes(b.estado));
  }, [historial, activeTab]);

  const renderItem = useCallback<ListRenderItem<BoletoRow>>(
    ({ item, index }) => (
      <StaggerItem index={index}>
        <TransactionCard
          type="boleto"
          id={formatCodigoBoleto(item.codigo_boleto) || item.id}
          estado={estadoParaInsignia(item)}
          titulo={`${formatCity(item.viajes?.rutas?.ciudad_origen) || 'Origen'} → ${
            formatCity(item.viajes?.rutas?.ciudad_destino) || 'Destino'
          }`}
          subtitulo={subtituloBoleto(item)}
          onPress={() =>
            router.push({
              pathname: '/boletos/[id]',
              params: { id: item.codigo_boleto || item.id },
            })
          }
        />
      </StaggerItem>
    ),
    [router]
  );

  const sinDatos = (historial ?? []).length === 0;
  /** La carga falló y no hay nada guardado: error honesto con "Reintentar" (M-36, APP-37). */
  const errorSinDatos = !!error && sinDatos;
  const errorTexto = error ? humanizeError(error, 'carga') : null;

  const emptyComponent = useMemo(
    () =>
      errorSinDatos ? (
        <ErrorState
          title="No pudimos cargar tus boletos"
          description={errorTexto ?? undefined}
          onRetry={refetch}
        />
      ) : activeTab === 'activos' ? (
        <EmptyState
          icon={CheckCircle}
          title="Sin boletos activos"
          description="Aquí verás tus asientos apartados y tus boletos pagados. Empieza por buscar un viaje."
          action={{
            children: 'Buscar viaje',
            icon: Bus,
            variant: 'accent',
            onPress: () => router.push('/boletos/buscar'),
          }}
        />
      ) : (
        <EmptyState
          icon={ClockCountdown}
          title="Sin historial aún"
          description="Tus viajes realizados, cancelados y vencidos aparecerán aquí."
        />
      ),
    [activeTab, router, errorSinDatos, errorTexto, refetch]
  );

  return (
    <Screen>
      <ScreenHeader title="Mis boletos" subtitle="Tus pasajes, reservas y pases de abordaje" />

      <Gutter style={{ paddingBottom: Spacing.lg }}>
        <SegmentedControl<TabType>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'activos', label: 'Activos', icon: CheckCircle, badge: counts.activos },
            { value: 'historial', label: 'Historial', icon: ClockCountdown },
          ]}
        />
      </Gutter>

      {loading ? (
        <Gutter>
          <CardSkeleton count={3} />
        </Gutter>
      ) : (
        <FlatList
          data={errorSinDatos ? [] : filteredData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            error && !sinDatos ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={() => void refetch()} /> : null
          }
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={scrollContent({
            tabbed: true,
            floatingAction: filteredData.length > 0,
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

      {/* Oculto en el estado vacío: el estado vacío ya ofrece la acción. */}
      {filteredData.length > 0 && (
        <FloatingBar tabbed>
          <Button
            variant="gradient"
            icon={Bus}
            glow
            fullWidth
            onPress={() => router.push('/boletos/buscar')}
          >
            Buscar viaje
          </Button>
        </FloatingBar>
      )}
    </Screen>
  );
}
