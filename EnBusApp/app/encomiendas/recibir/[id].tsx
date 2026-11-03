import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle,
  Clock,
  Copy,
  Info,
  LockKey,
  Storefront,
  XCircle,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusTimeline, buildEncomiendaTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { PageTransition } from '@/src/components/PageTransition';
import { PressableScale } from '@/src/components/PressableScale';
import { useToast } from '@/src/components/Toast';
import {
  BottomSheet,
  Button,
  Card,
  Divider,
  ErrorState,
  InfoRow,
  LoadingState,
  Monto,
  Screen,
  ScreenHeader,
  StaleBanner,
  StatusBadge,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { urlFotoEncomienda } from '@/src/utils/fotos';
import { SOPORTE_WHATSAPP } from '@/src/utils/soporte';
import { formatCity } from '@/src/utils/formatters';
import { getCobroEncomienda, getEstadoVisual, puedePagarEncomienda } from '@/src/utils/estados';
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
import type { Encomienda, RemitenteEncomienda } from '@/src/types';
import { Colors, Radius, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';

interface HistorialRow {
  estado_nuevo: string;
  created_at: string;
}

type EncomiendaDetalle = Encomienda & { cooperativas?: { nombre: string } | null };

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

  const [encomienda, setEncomienda] = useState<EncomiendaDetalle | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [pagos, setPagos] = useState<PagoEncomienda[]>([]);
  const [remitente, setRemitente] = useState<RemitenteEncomienda | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
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
          .order('created_at', { ascending: true }),
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
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      <Screen background={Colors.surface}>
        <ScreenHeader
          variant="compact"
          eyebrow="Encomienda para ti"
          title="Cargando…"
          onBack={() => router.back()}
        />
        <LoadingState label="Buscando la encomienda…" />
      </Screen>
    );
  }

  if (!encomienda) {
    return (
      <Screen background={Colors.surface}>
        <ScreenHeader variant="compact" title="Encomienda para ti" onBack={() => router.back()} />
        <ErrorState
          title="No pudimos cargar esta encomienda"
          description={errorCarga ?? 'Revisa tu conexión e inténtalo de nuevo.'}
          onRetry={fetchData}
        />
      </Screen>
    );
  }

  const estadoVisual = getEstadoVisual('encomienda', encomienda.estado);
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
    <Screen background={Colors.surface}>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          eyebrow="Encomienda para ti"
          title={tracking ?? 'Encomienda'}
          onBack={() => router.back()}
          right={<StatusBadge dominio="encomienda" estado={encomienda.estado} size="md" bordered />}
        />

        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing.lg })}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.accent]}
              tintColor={Colors.accent}
            />
          }
        >
          {errorCarga ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={fetchData} /> : null}

          {!enOficina && estadoVisual.hint ? (
            <Text variant="secondary" color="muted" style={s.hint}>
              {estadoVisual.hint}
            </Text>
          ) : null}

          {/* ── PIN de retiro (APP-45): destacado solo cuando ya se puede retirar ─ */}
          {enOficina && pin ? (
            <Card padding="md" elevated={false} style={[s.card, s.pinCard]}>
              <Text variant="bodyStrong" align="center">
                {`Lista para retirar: presenta este PIN y tu cédula en ${puntoRetiro.completo}`}
              </Text>
              {puntoRetiro.detalle ? (
                <Text variant="caption" color="muted" align="center" style={s.pinDetalle}>
                  {puntoRetiro.detalle}
                </Text>
              ) : null}
              <Text
                variant="display"
                color="foreground"
                align="center"
                compact
                style={s.pin}
                accessibilityLabel={`PIN de retiro ${pin.split('').join(' ')}`}
              >
                {pin}
              </Text>
              {encomienda.pin_bloqueado ? (
                <View style={s.pinBloqueado}>
                  <LockKey size={Sizes.icon.md} color={Colors.dangerText} weight="bold" />
                  <Text variant="caption" color="dangerText" style={s.flex}>
                    {`Tu PIN se bloqueó por intentos fallidos. Pide en la taquilla que lo desbloqueen${
                      SOPORTE_WHATSAPP ? ' o escríbenos por WhatsApp desde Ayuda' : ''
                    }.`}
                  </Text>
                </View>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                icon={Copy}
                onPress={() => copiarPin(pin)}
                accessibilityLabel="Copiar PIN"
              >
                Copiar PIN
              </Button>
            </Card>
          ) : pinActivo ? (
            <Card padding="md" elevated={false} style={[s.card, s.pinLinea]}>
              <LockKey size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
              <Text variant="secondary" color="muted" style={s.flex}>
                {pin
                  ? `Tu PIN: ${pin} · Lo necesitarás cuando llegue a ${ciudadDestino}.`
                  : enOficina
                    ? 'No pudimos mostrar tu PIN. Desliza hacia abajo para actualizar o pídelo en la taquilla con tu cédula.'
                    : 'Tu PIN aparecerá cuando la cooperativa reciba el paquete.'}
              </Text>
            </Card>
          ) : null}

          {/* ── Remitente, paquete y costo ──────────────────────────────── */}
          <Card padding="md" style={s.card}>
            <InfoRow label="Te lo envía" value={nombreRemitente || 'Sin datos de quien envía'} />
            {telefonoRemitente ? (
              <Text variant="caption" color="muted" style={s.phone}>
                {`Teléfono de quien envía: ${telefonoRemitente}`}
              </Text>
            ) : null}

            <Divider spacing={Spacing.md} />

            <View style={s.row}>
              <InfoRow label="Contenido" value={encomienda.descripcion_contenido || '—'} />
              <InfoRow
                label="Peso"
                value={
                  Number(encomienda.peso_kg) > 0
                    ? `${formatNumeroVE(Number(encomienda.peso_kg), 1)} kg`
                    : '—'
                }
                align="right"
              />
            </View>

            <Divider spacing={Spacing.md} />

            {/* M-51: el costo dice lo mismo que el bloque de cobro. */}
            <View style={s.costRow}>
              <View style={s.costLabel}>
                <Text variant="overline" color="muted" uppercase>
                  Costo del envío
                </Text>
                <Text variant="caption" color="muted">
                  {!pagaDestino
                    ? cobro.estado === 'PAGADO'
                      ? 'Pagado por quien te lo envió'
                      : 'Lo paga quien te lo envió'
                    : costo > 0
                      ? cobro.estado === 'PAGADO'
                        ? 'Pagado'
                        : 'Pagas al retirar'
                      : 'Se calcula cuando la taquilla pese el paquete'}
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

            <Divider spacing={Spacing.md} />

            <View style={s.puntoRow}>
              <Storefront size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
              <View style={s.flex}>
                <Text variant="overline" color="muted" uppercase>
                  Dónde retirarla
                </Text>
                <Text variant="bodyStrong">{puntoRetiro.completo}</Text>
                {puntoRetiro.detalle && !enOficina ? (
                  <Text variant="caption" color="muted">
                    {puntoRetiro.detalle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          {/* ── Cobro ───────────────────────────────────────────────────── */}
          {!pagaDestino ? (
            cobro.estado === 'PAGADO' ? (
              <AvisoCobro tone="success" icon={CheckCircle} titulo="Pagado por quien envía">
                Para retirarla solo necesitas tu PIN y tu cédula.
              </AvisoCobro>
            ) : cobro.estado !== 'NO_APLICA' ? (
              <AvisoCobro tone="neutral" icon={Info} titulo="No tienes que pagar nada">
                El envío lo paga quien te lo envió.
              </AvisoCobro>
            ) : null
          ) : cobro.estado === 'PAGADO' ? (
            <AvisoCobro tone="success" icon={CheckCircle} titulo={pagoEsMio ? 'Pago confirmado' : 'Pagado por quien envía'}>
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
                ? 'Quien envía ya registró el pago; está en verificación. No tienes que pagar nada.'
                : pagoVisible?.numero_referencia
                  ? `Registraste tu pago con la referencia ${pagoVisible.numero_referencia}. La cooperativa lo está revisando y te avisaremos cuando lo confirme.`
                  : 'La cooperativa está revisando tu pago y te avisaremos cuando lo confirme.'}
            </AvisoCobro>
          ) : pago.pagoDeOtro ? (
            <AvisoCobro tone="progress" icon={Info} titulo="Ya hay un pago registrado">
              Quien te lo envió ya registró un pago para este envío. Si la cooperativa lo rechaza,
              podrás pagarlo tú desde aquí.
            </AvisoCobro>
          ) : cobro.estado === 'COSTO_PENDIENTE' ? (
            <AvisoCobro tone="neutral" icon={Storefront} titulo="Pagas al retirar">
              El costo se calcula cuando la taquilla pese el paquete. Después podrás pagarlo desde
              aquí o en la oficina de destino.
            </AvisoCobro>
          ) : null}

          {cobro.estado === 'RECHAZADO' && pagaDestino && !pago.pagoDeOtro ? (
            <AvisoCobro tone="danger" icon={XCircle} titulo="Pago rechazado">
              {pagoEsMio
                ? `Motivo: ${cobro.motivoRechazo || 'la cooperativa no indicó el motivo.'} Revisa los datos y registra el pago de nuevo.`
                : `La cooperativa rechazó el pago que registró quien envía (${
                    cobro.motivoRechazo || 'no indicó el motivo'
                  }). Puedes pagarlo tú desde aquí o en la oficina de destino al retirarla.`}
            </AvisoCobro>
          ) : null}

          {/* Nunca un formulario con costo 0: `puedePagarEncomienda` exige costo calculado. */}
          {debePagar && encomienda.cooperativa_id ? (
            <View style={s.card}>
              <Text variant="subheading">Paga el envío</Text>
              <Text variant="secondary" color="muted" style={s.sectionText}>
                Puedes pagarlo ahora desde la app o en la oficina de destino al retirarlo.
              </Text>
              {pago.cargandoTasa || !pago.cotizacion ? (
                <Card padding="lg">
                  <LoadingState label="Calculando el monto en bolívares…" compact />
                </Card>
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
          <Card padding="md" style={s.card}>
            <Text variant="subheading">Seguimiento</Text>
            <StatusTimeline
              estados={buildEncomiendaTimeline(encomienda.estado, historial, {
                creadaAt: encomienda.created_at,
              })}
            />
          </Card>

          {/* ── Fotos ───────────────────────────────────────────────────── */}
          {fotos.length > 0 ? (
            <Card padding="md" style={s.card}>
              <Text variant="subheading" style={s.cardTitle}>
                Foto del paquete
              </Text>
              {fotos.map((uri, i) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={[s.photo, i > 0 ? s.photoSecond : null]}
                  resizeMode="cover"
                  accessibilityLabel="Foto del paquete"
                />
              ))}
              <Text variant="caption" color="muted" style={s.photoCaption}>
                Así se veía el paquete cuando lo registraron. Revísalo al retirarlo.
              </Text>
            </Card>
          ) : null}

          <PressableScale
            onPress={reportar}
            haptic
            hapticType="selection"
            style={s.reportar}
            accessibilityRole="button"
            accessibilityLabel="¿Problemas con este envío? Reportar un problema"
          >
            <Text variant="caption" color="muted" align="center">
              ¿Problemas con este envío?{' '}
              <Text variant="caption" weight="bold" color="foreground" style={s.link}>
                Reportar un problema
              </Text>
            </Text>
          </PressableScale>
        </ScrollView>
      </PageTransition>

      {/* ── EB_TASA_CAMBIO ──────────────────────────────────────────────── */}
      <BottomSheet
        visible={pago.tasaCambio !== null}
        onClose={pago.descartarTasaCambio}
        title="Cambió el total"
        footer={
          <View style={s.sheetFooter}>
            <Button
              variant="accent"
              fullWidth
              loading={pago.reintentando}
              onPress={pago.confirmarNuevaTasa}
            >
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
  icon: Icon,
  titulo,
  children,
  extra,
}: {
  tone: StatusTone;
  icon: React.ComponentType<{ size?: number; color?: string; weight?: 'fill' }>;
  titulo: string;
  children: string;
  extra?: React.ReactNode;
}) {
  const palette = StatusPalette[tone];
  return (
    <Card padding="md" style={s.card} accessibilityRole="summary">
      <View style={s.avisoHead}>
        <View style={[s.avisoIcon, { backgroundColor: palette.bg }]}>
          <Icon color={palette.fg} weight="fill" size={Sizes.icon.lg} />
        </View>
        <View style={s.avisoBody}>
          <Text variant="bodyStrong">{titulo}</Text>
          <Text variant="secondary" color="muted">
            {children}
          </Text>
          {extra}
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hint: {
    marginBottom: Spacing.lg,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    marginBottom: Spacing.md,
  },
  sectionText: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  pinCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    // APP-45: brand tint behind a dark PIN — never yellow text on white.
    backgroundColor: Colors.primaryLight,
    borderWidth: Sizes.hairline,
    borderColor: Colors.primaryBorder,
  },
  pinDetalle: {
    marginTop: -Spacing.xs,
  },
  pin: {
    letterSpacing: 8,
    marginVertical: Spacing.sm,
  },
  pinBloqueado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pinLinea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  puntoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  phone: {
    marginTop: -Spacing.sm,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  costLabel: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  avisoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  avisoIcon: {
    width: Sizes.iconBox.lg,
    height: Sizes.iconBox.lg,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
  },
  photoSecond: {
    marginTop: Spacing.lg,
  },
  photoCaption: {
    marginTop: Spacing.md,
  },
  reportar: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  link: {
    textDecorationLine: 'underline',
  },
  sheetFooter: {
    gap: Spacing.sm,
  },
  sheetText: {
    marginBottom: Spacing.md,
  },
});
