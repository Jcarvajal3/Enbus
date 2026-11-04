import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ClockCounterClockwise, Ticket } from 'phosphor-react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { TransactionCard } from '@/src/components/TransactionCard';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { StaggerItem } from '@/src/components/StaggerItem';
import { HeaderActions } from '@/src/components/HeaderActions';
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

const SALTO_DE_LINEA = '\n';

/** "Sale vie. 4 oct. · 8:30 a. m." y debajo "Asiento 14" (la salida, no la fecha de compra). */
function subtituloBoleto(b: BoletoRow): string {
  const salida = b.viajes?.fecha_hora_salida;
  const partes: string[] = [salida ? `Sale ${formatSalidaCorta(salida)}` : 'Salida por confirmar'];
  if (b.asiento) partes.push(`Asiento ${b.asiento}`);
  return partes.join(SALTO_DE_LINEA);
}

/** Milisegundos de la salida, o `null` si el boleto no la trae (o no se puede leer). */
function salidaMs(b: BoletoRow): number | null {
  const v = b.viajes?.fecha_hora_salida;
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

const creadoMs = (b: BoletoRow) => {
  const t = Date.parse(b.created_at);
  return Number.isNaN(t) ? 0 : t;
};

/** Activos: la salida más cercana primero; sin salida, al final (APP-36). */
function ordenActivos(a: BoletoRow, b: BoletoRow): number {
  const sa = salidaMs(a);
  const sb = salidaMs(b);
  if (sa !== null && sb !== null && sa !== sb) return sa - sb;
  if (sa === null && sb !== null) return 1;
  if (sa !== null && sb === null) return -1;
  return creadoMs(b) - creadoMs(a);
}

/** Historial: la salida más reciente primero; sin salida, por fecha de compra. */
function ordenHistorial(a: BoletoRow, b: BoletoRow): number {
  const ta = salidaMs(a) ?? creadoMs(a);
  const tb = salidaMs(b) ?? creadoMs(b);
  if (ta !== tb) return tb - ta;
  return creadoMs(b) - creadoMs(a);
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
    hayMas,
    cargarMas,
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
    return historial
      .filter((b) => (target as readonly string[]).includes(b.estado))
      .sort(activeTab === 'activos' ? ordenActivos : ordenHistorial);
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
          icon={Ticket}
          title="Sin boletos activos"
          description="Busca un viaje y aparta tu asiento."
          action={{
            children: 'Buscar viaje',
            icon: Ticket,
            onPress: () => router.push('/boletos/buscar'),
          }}
        />
      ) : (
        <EmptyState
          icon={ClockCounterClockwise}
          title="Sin historial todavía"
          description="Aquí quedan tus viajes realizados y cancelados."
        />
      ),
    [activeTab, router, errorSinDatos, errorTexto, refetch]
  );

  return (
    <Screen>
      <ScreenHeader title="Mis boletos" right={<HeaderActions />} />

      {/* Misma espera que "Mis encomiendas": la forma de la pestaña (§2.3). */}
      {loading ? (
        <ScreenSkeleton variante="lista" />
      ) : (
        <>
          <Gutter style={{ paddingBottom: Spacing.lg }}>
            <SegmentedControl<TabType>
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: 'activos', label: 'Activos', icon: Ticket, badge: counts.activos },
                { value: 'historial', label: 'Historial', icon: ClockCounterClockwise },
              ]}
            />
          </Gutter>

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
                colors={[Colors.accentStrong]}
                tintColor={Colors.accentStrong}
              />
            }
            // Más de 30 boletos (o asientos cambiados antes de pagar): la página siguiente.
            onEndReached={hayMas && !error ? cargarMas : undefined}
            onEndReachedThreshold={0.5}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={8}
          />
        </>
      )}

      {/* Oculto en el estado vacío: el estado vacío ya ofrece la acción. */}
      {filteredData.length > 0 && (
        <FloatingBar tabbed>
          <Button icon={Ticket} fullWidth onPress={() => router.push('/boletos/buscar')}>
            Buscar viaje
          </Button>
        </FloatingBar>
      )}
    </Screen>
  );
}
