import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle,
  Clock,
  Copy,
  Info,
  LockKey,
  Package,
  Storefront,
  XCircle,
  type IconProps,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusTimeline, buildEncomiendaTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { ScreenSkeleton, SkeletonLoader } from '@/src/components/SkeletonLoader';
import { useToast } from '@/src/components/Toast';
import {
  Atmosfera,
  Aviso,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconTile,
  InfoRow,
  Monto,
  Screen,
  ScreenHeader,
  StaleBanner,
  StatusBadge,
  Text,
  TextLink,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useRecargaEnVivo } from '@/src/hooks/useRecargaEnVivo';
import { useAuth } from '@/src/contexts/AuthContext';
import { urlFotoEncomienda } from '@/src/utils/fotos';
import { SOPORTE_WHATSAPP } from '@/src/utils/soporte';
import { capitalizarInicio, formatCity } from '@/src/utils/formatters';
import { getCobroEncomienda, puedePagarEncomienda } from '@/src/utils/estados';
import { humanizeError } from '@/src/utils/errores';
import { formatNumeroVE, tasaRefDe } from '@/src/utils/dinero';
import {
  cargarPagosEncomienda,
  describirPunto,
  textoTasaCambio,
  usePagoEncomienda,
  useSucursalesEncomienda,
  type PagoEncomienda,
} from '@/src/hooks/useEncomiendas';
import { useVolver } from '@/src/hooks/useVolver';
import type { Encomienda, RemitenteEncomienda } from '@/src/types';
import { alpha, Colors, Radius, Shadows, Sizes, Spacing, type StatusTone } from '@/src/theme';

interface HistorialRow {
  estado_nuevo: string;
  created_at: string;
}

type EncomiendaDetalle = Encomienda & { cooperativas?: { nombre: string } | null };

/** Ceja del detalle = nombre del segmento de la lista (AN-07). */
const CEJA = 'Para mí';

/** Estados en los que el PIN ya no sirve (paquete entregado o envío cerrado). */
const SIN_PIN = ['ENTREGADA', 'CANCELADA', 'DEVUELTA'];

/** "•••••1234": solo los últimos 4 dígitos de un teléfono. */
function enmascararTelefono(tel: string | null | undefined): string | null {
  const digitos = (tel ?? '').replace(/\D/g, '');
  if (digitos.length < 4) return null;
  return `•••••${digitos.slice(-4)}`;
}

export default function DetalleRecibirScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const volver = useVolver('/(tabs)/encomiendas?vista=para-mi');

  const [encomienda, setEncomienda] = useState<EncomiendaDetalle | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [pagos, setPagos] = useState<PagoEncomienda[]>([]);
  const [remitente, setRemitente] = useState<RemitenteEncomienda | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** Sin fila (enlace viejo o de otra cuenta): vacío con salida, no "Reintentar". */
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [actualizadoAt, setActualizadoAt] = useState<number | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!id) return;
    const cacheKey = `cache:encomienda_recibo:${id}`;

    try {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMountedRef.current) {
          const parsed = JSON.parse(cached);
          setEncomienda((prev) => prev ?? parsed.encomienda ?? null);
          setHistorial((prev) => (prev.length ? prev : (parsed.historial ?? [])));
          setRemitente((prev) => prev ?? parsed.remitente ?? null);
          setPagos((prev) => (prev.length ? prev : (parsed.pagos ?? [])));
          setActualizadoAt((prev) => prev ?? parsed.at ?? null);
          setLoading(false);
        }
      } catch {
        // Caché ilegible: manda la carga de red.
      }

      const [encResult, histResult, remitenteResult, pagosResult] = await Promise.all([
        supabase.from('encomiendas').select('*, cooperativas ( nombre )').eq('id', id).single(),
        supabase
          .from('encomienda_estado_historial')
          .select('estado_nuevo, created_at')
          .eq('encomienda_id', id)
          .order('created_at', { ascending: true })
          .limit(100),
        // M-50: el destinatario no puede leer el perfil del remitente (RLS).
        supabase.rpc('fn_remitente_de_encomienda', { p_encomienda_id: id }),
        cargarPagosEncomienda(id).then(
          (data) => ({ data, error: null as unknown }),
          (error: unknown) => ({ data: null, error })
        ),
      ]);

      if (encResult.error) throw encResult.error;
      if (!isMountedRef.current) return;

      // Remitente y pagos son complementarios: si fallan, la pantalla usa lo que ya tenía.
      const remitenteData = remitenteResult.error
        ? null
        : ((remitenteResult.data ?? null) as RemitenteEncomienda | null);
      const enc = encResult.data as EncomiendaDetalle;
      const ahora = Date.now();
      setEncomienda(enc);
      setHistorial(histResult.data ?? []);
      if (remitenteData) setRemitente(remitenteData);
      if (pagosResult.data) setPagos(pagosResult.data);
      setErrorCarga(null);
      setActualizadoAt(ahora);

      AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          at: ahora,
          encomienda: enc,
          historial: histResult.data ?? [],
          remitente: remitenteData,
          pagos: pagosResult.data ?? [],
        })
      ).catch(() => {});

      const urls = await Promise.all([
        urlFotoEncomienda(enc.foto_evidencia_url),
        urlFotoEncomienda(enc.foto_cliente_path),
      ]);
      if (isMountedRef.current) setFotos(urls.filter((u): u is string => !!u));
    } catch (err) {
      if (__DEV__) console.warn('[recibir] Error cargando encomienda:', err);
      if (isMountedRef.current) setErrorCarga(humanizeError(err, 'carga'));
      if (isMountedRef.current) setNoEncontrada((err as { code?: string } | null)?.code === 'PGRST116');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // La taquilla recibe, despacha o entrega el paquete: la pantalla se actualiza sola.
  useRecargaEnVivo(
    'encomiendas',
    id && /^[0-9a-f-]{36}$/i.test(id) ? `id=eq.${id}` : null,
    fetchData
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      if (isMountedRef.current) setRefreshing(false);
    }
  }, [fetchData]);

  const pago = usePagoEncomienda(encomienda, {
    onRegistrado: () => {
      toast.show('success', 'Registramos tu pago. La cooperativa lo revisará y te avisaremos.');
      fetchData();
    },
    onDesactualizada: () => {
      fetchData();
    },
  });

  const cobro = useMemo(() => getCobroEncomienda(encomienda, pagos), [encomienda, pagos]);
  const puntos = useSucursalesEncomienda(encomienda);

  const copiarPin = useCallback(
    async (pin: string) => {
      try {
        await Clipboard.setStringAsync(pin);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show('success', 'PIN copiado.');
      } catch {
        toast.show('error', 'No pudimos copiar el PIN. Anótalo o tómale una captura.');
      }
    },
    [toast]
  );

  if (loading) {
    return (
      <Screen atmosfera="calida">
        <ScreenHeader variant="compact" eyebrow={CEJA} title="Encomienda" onBack={volver} />
        <ScreenSkeleton variante="detalle" />
      </Screen>
    );
  }

  if (!encomienda) {
    return (
      <Screen atmosfera="calida">
        <ScreenHeader variant="compact" eyebrow={CEJA} title="Encomienda" onBack={volver} />
        {noEncontrada ? (
          <EmptyState
            icon={Package}
            title="Encomienda no encontrada"
            description="Puede ser de otra cuenta o ya no estar disponible."
            action={{
              children: 'Ir a Mis encomiendas',
              icon: Package,
              onPress: () => router.dismissTo('/(tabs)/encomiendas?vista=para-mi'),
            }}
          />
        ) : (
          <ErrorState
            title="No pudimos cargar la encomienda"
            description={errorCarga ?? 'Revisa tu conexión.'}
            onRetry={fetchData}
          />
        )}
      </Screen>
    );
  }

  const costo = Number(encomienda.costo_calculado);
  const pagaDestino = encomienda.modalidad_pago === 'DESTINO';
  const tracking = encomienda.tracking_id ?? null;
  const nombreCoop = encomienda.cooperativas?.nombre ?? null;
  const ciudadDestino = formatCity(encomienda.ciudad_destino) || 'tu ciudad';
  const debePagar = !pago.pagoDeOtro && puedePagarEncomienda(encomienda, cobro, 'destinatario');
  const pagoVisible = cobro.pago;
  /** `pagador_id` distingue "Tu pago…" del pago de quien envía (política de la fase 3). */
  const pagoEsMio = !pagoVisible?.pagador_id || pagoVisible.pagador_id === user?.id;

  const enOficina = encomienda.estado === 'EN_OFICINA_DESTINO';
  const pinActivo = !SIN_PIN.includes(encomienda.estado);
  const pin = encomienda.pin_retiro ?? null;

  // Alta presencial: `sender_id` es el empleado; el remitente real va en `remitente_*`.
  const esTaquilla = encomienda.origen_registro === 'TAQUILLA';
  const nombreRemitente = esTaquilla ? encomienda.remitente_nombre : remitente?.nombre;
  const telefonoRemitente = esTaquilla
    ? enmascararTelefono(encomienda.remitente_telefono)
    : remitente?.telefono
      ? `•••••${remitente.telefono.replace(/\D/g, '').slice(-4)}`
      : null;

  const puntoRetiro = describirPunto(puntos.destino, {
    preferidaId: encomienda.sucursal_destino_id,
    cooperativa: nombreCoop,
    ciudad: ciudadDestino,
  });

  const reportar = () =>
    router.push({
      pathname: '/ayuda',
      params: { tipo: 'encomienda', id: encomienda.id, codigo: tracking ?? '' },
    });

  return (
    <Screen atmosfera="calida">
      <ScreenHeader
        variant="compact"
        eyebrow={CEJA}
        title={tracking ?? 'Encomienda'}
        onBack={volver}
        status={<StatusBadge dominio="encomienda" estado={encomienda.estado} />}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ top: Spacing.lg })}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.mutedForeground]}
            tintColor={Colors.mutedForeground}
          />
        }
      >
        {errorCarga ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={fetchData} /> : null}

        {/* ── PIN de retiro (APP-45): destacado solo cuando ya se puede retirar.
            Sin la pista del estado (AU-03): es la instrucción de quien envía. ─ */}
        {enOficina && pin ? (
          <View style={[s.card, s.pinCard]}>
            <Atmosfera variante="noche" style={StyleSheet.absoluteFill} />
            <Text variant="subheading" color="inverse" align="center">
              {`Retírala en ${puntoRetiro.completo} con este PIN y tu cédula`}
            </Text>
            {puntoRetiro.detalle ? (
              <Text variant="caption" color="inverseMuted" align="center">
                {puntoRetiro.detalle}
              </Text>
            ) : null}
            <View
              style={s.pin}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`PIN de retiro ${pin.split('').join(' ')}`}
            >
              {pin.split('').map((digito, i) => (
                <View key={i} style={s.pinDigito}>
                  <Text variant="title" size="2xl" tracking="normal" color="inverse" compact>
                    {digito}
                  </Text>
                </View>
              ))}
            </View>
            {encomienda.pin_bloqueado ? (
              <Aviso
                tono="danger"
                icon={LockKey}
                texto={`Tu PIN se bloqueó por intentos fallidos. Pide en la taquilla que lo desbloqueen${
                  SOPORTE_WHATSAPP ? ' o escríbenos desde Ayuda' : ''
                }.`}
                style={s.pinBloqueado}
              />
            ) : null}
            <Button
              variant="secondary"
              size="md"
              icon={Copy}
              onPress={() => copiarPin(pin)}
              accessibilityLabel="Copiar PIN"
              style={s.pinCopiar}
            >
              Copiar PIN
            </Button>
          </View>
        ) : pinActivo ? (
          <Card style={[s.card, s.pinLinea]}>
            <IconTile tone="brand" icon={LockKey} />
            <Text variant="secondary" style={s.flex}>
              {pin
                ? `Tu PIN es ${pin}. Lo necesitarás cuando llegue a ${ciudadDestino}.`
                : enOficina
                  ? 'No pudimos mostrar tu PIN. Desliza hacia abajo o pídelo en la taquilla con tu cédula.'
                  : 'Tu PIN aparecerá cuando la cooperativa la reciba.'}
            </Text>
          </Card>
        ) : null}

        {/* ── Remitente, paquete y costo ──────────────────────────────── */}
        <Card style={s.card}>
          <Text variant="subheading">Detalles</Text>
          <InfoRow label="Te la envía" value={nombreRemitente || 'Sin datos de quien envía'} />
          {telefonoRemitente ? (
            <Text variant="caption" color="muted" style={s.phone}>
              {`Teléfono ${telefonoRemitente}`}
            </Text>
          ) : null}

          <Divider spacing={Spacing.xs} />

          <View style={s.row}>
            <InfoRow label="Contenido" value={encomienda.descripcion_contenido || '—'} />
            <InfoRow
              label="Peso"
              value={
                Number(encomienda.peso_kg) > 0
                  ? `${formatNumeroVE(Number(encomienda.peso_kg), 1)} kg`
                  : 'Por pesar'
              }
              align="right"
            />
          </View>

          <Divider spacing={Spacing.xs} />

          {/* M-51 y AN-19: "No pagas nada" solo aquí, una vez. */}
          <View style={s.costRow}>
            <View style={s.flex}>
              <Text variant="caption" color="muted">
                Costo del envío
              </Text>
              <Text variant="bodyStrong">
                {!pagaDestino
                  ? cobro.estado === 'PAGADO'
                    ? 'Pagado por quien envía'
                    : 'Lo paga quien envía'
                  : cobro.estado === 'PAGADO'
                    ? 'Pagado'
                    : 'Pagas al retirar'}
              </Text>
            </View>
            {pagaDestino && costo > 0 ? (
              <Monto usd={costo} size="sm" align="right" />
            ) : !pagaDestino ? (
              <Text variant="bodyStrong" align="right">
                No pagas nada
              </Text>
            ) : (
              <Text variant="bodyStrong" align="right">
                Por calcular
              </Text>
            )}
          </View>

          <Divider spacing={Spacing.xs} />

          <View style={s.puntoRow}>
            <IconTile size="sm" tone="coral" icon={Storefront} />
            <View style={s.flex}>
              <Text variant="caption" color="muted">
                Dónde retirarla
              </Text>
              <Text variant="bodyStrong">{capitalizarInicio(puntoRetiro.completo)}</Text>
              {puntoRetiro.detalle && !enOficina ? (
                <Text variant="caption" color="muted">
                  {puntoRetiro.detalle}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {/* ── Cobro: solo cuando paga quien recibe (AU-43) ───────────── */}
        {!pagaDestino ? null : cobro.estado === 'PAGADO' ? (
          <AvisoCobro
            tone="success"
            icon={CheckCircle}
            titulo={pagoEsMio ? 'Pago confirmado' : 'Pagado por quien envía'}
          >
            Para retirarla solo necesitas tu PIN y tu cédula.
          </AvisoCobro>
        ) : cobro.estado === 'EN_VERIFICACION' ? (
          <AvisoCobro
            tone="pending"
            icon={Clock}
            titulo="Pago en verificación"
            extra={
              pagoVisible ? (
                <Monto
                  usd={pagoVisible.monto ?? costo}
                  bs={pagoVisible.monto_bs ?? null}
                  tasa={tasaRefDe(pagoVisible.tasa_bcv, pagoVisible.tasa_bcv_fecha)}
                  moneda={pagoVisible.moneda}
                  size="sm"
                />
              ) : null
            }
          >
            {!pagoEsMio
              ? 'Quien envía registró el pago y la cooperativa lo está revisando.'
              : pagoVisible?.numero_referencia
                ? `Referencia ${pagoVisible.numero_referencia}. Te avisaremos cuando la cooperativa lo confirme.`
                : 'Te avisaremos cuando la cooperativa lo confirme.'}
          </AvisoCobro>
        ) : pago.pagoDeOtro ? (
          <AvisoCobro tone="progress" icon={Info} titulo="Ya hay un pago registrado">
            Quien envía ya registró un pago. Si la cooperativa lo rechaza, podrás pagarlo tú.
          </AvisoCobro>
        ) : cobro.estado === 'COSTO_PENDIENTE' ? (
          <AvisoCobro tone="neutral" icon={Storefront} titulo="Pagas al retirar">
            La taquilla calcula el costo al pesar el paquete.
          </AvisoCobro>
        ) : null}

        {cobro.estado === 'RECHAZADO' && pagaDestino && !pago.pagoDeOtro ? (
          <AvisoCobro tone="danger" icon={XCircle} titulo="Pago rechazado">
            {`Motivo: ${cobro.motivoRechazo || 'la cooperativa no indicó el motivo.'} ${
              pagoEsMio
                ? 'Registra el pago de nuevo.'
                : 'Lo había registrado quien envía; puedes pagarlo tú.'
            }`}
          </AvisoCobro>
        ) : null}

        {/* Nunca un formulario con costo 0: `puedePagarEncomienda` exige costo calculado. */}
        {debePagar && encomienda.cooperativa_id ? (
          <View style={s.card}>
            {pago.cargandoTasa || !pago.cotizacion ? (
              <SkeletonLoader height={Sizes.control.xl * 3} borderRadius={Radius.xl} />
            ) : (
              <PaymentFlow
                cooperativaId={encomienda.cooperativa_id}
                concepto={`Encomienda ${tracking ?? ''}`.trim()}
                tipoRecurso="encomienda"
                cotizacion={pago.cotizacion}
                onRegistrar={pago.registrar}
                bloqueado={pago.reintentando}
              />
            )}
          </View>
        ) : null}

        {/* ── Seguimiento ─────────────────────────────────────────────── */}
        <Card style={s.card}>
          <Text variant="subheading">Seguimiento</Text>
          <StatusTimeline
            estados={buildEncomiendaTimeline(encomienda.estado, historial, {
              creadaAt: encomienda.created_at,
            })}
          />
        </Card>

        {/* ── Fotos ───────────────────────────────────────────────────── */}
        {fotos.length > 0 ? (
          <Card style={s.card}>
            <Text variant="subheading" style={s.cardTitle}>
              Fotos
            </Text>
            {fotos.map((uri, i) => (
              <Image
                key={uri}
                source={{ uri }}
                style={[s.photo, i > 0 ? s.photoSecond : null]}
                resizeMode="contain"
                accessibilityLabel="Foto de la encomienda"
              />
            ))}
            <Text variant="caption" color="muted" style={s.photoCaption}>
              Revísala al retirarla
            </Text>
          </Card>
        ) : null}

        <View style={s.reportar}>
          <Text variant="caption" color="muted" align="center">
            ¿Problemas con esta encomienda?
          </Text>
          <View style={s.reportarEnlace}>
            <TextLink onPress={reportar}>Reportar un problema</TextLink>
          </View>
        </View>
      </ScrollView>

      {/* ── EB_TASA_CAMBIO ──────────────────────────────────────────────── */}
      <BottomSheet
        visible={pago.tasaCambio !== null}
        onClose={pago.descartarTasaCambio}
        title="Cambió el total"
        footer={
          <View style={s.sheetFooter}>
            <Button fullWidth loading={pago.reintentando} onPress={pago.confirmarNuevaTasa}>
              Registrar con el nuevo total
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={pago.reintentando}
              onPress={pago.descartarTasaCambio}
            >
              Revisar
            </Button>
          </View>
        }
      >
        <Text variant="body" style={s.sheetText}>
          {pago.tasaCambio ? textoTasaCambio(pago.tasaCambio) : ''}
        </Text>
      </BottomSheet>
    </Screen>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AvisoCobro({
  tone,
  icon,
  titulo,
  children,
  extra,
}: {
  tone: StatusTone;
  icon: React.ComponentType<IconProps>;
  titulo: string;
  children: string;
  extra?: React.ReactNode;
}) {
  return (
    <Aviso estado={tone} icon={icon} titulo={titulo} texto={children} extra={extra} style={s.card} />
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    marginBottom: Spacing.lg,
  },
  // El PIN es a lo que se viene: de noche, cada cifra en su casilla.
  pinCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: Colors.night,
    ...Shadows.raised,
  },
  pin: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs + Spacing.xs / 2,
    marginVertical: Spacing.md,
  },
  pinDigito: {
    flex: 1,
    maxWidth: Sizes.iconBox.lg,
    height: Sizes.control.xl,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(Colors.white, 0.12),
  },
  pinBloqueado: {
    alignSelf: 'stretch',
    marginBottom: Spacing.sm,
  },
  pinCopiar: {
    borderWidth: 0,
  },
  pinLinea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  puntoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  phone: {
    marginBottom: Spacing.sm,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  photoSecond: {
    marginTop: Spacing.lg,
  },
  photoCaption: {
    marginTop: Spacing.sm,
  },
  reportar: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  /** `TextLink` se alinea al inicio: este envoltorio lo centra. */
  reportarEnlace: {
    alignSelf: 'center',
  },
  sheetFooter: {
    gap: Spacing.sm,
  },
  sheetText: {
    marginBottom: Spacing.md,
  },
});
