import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle,
  Clock,
  Info,
  Package,
  Storefront,
  UserCircle,
  WhatsappLogo,
  XCircle,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StatusTimeline, buildEncomiendaTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { ScreenSkeleton, SkeletonLoader } from '@/src/components/SkeletonLoader';
import {
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  InfoRow,
  Monto,
  Screen,
  ScreenHeader,
  StaleBanner,
  StatusBadge,
  Text,
  TextLink,
  scrollContent,
  useConfirm,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { urlFotoEncomienda } from '@/src/utils/fotos';
import { qrEncomienda } from '@/src/utils/codigos';
import { abrirWhatsApp } from '@/src/utils/soporte';
import { telefonoValido } from '@/src/utils/validation';
import { capitalizarInicio, formatCity } from '@/src/utils/formatters';
import {
  MODALIDAD_PAGO,
  getCobroEncomienda,
  getEstadoVisual,
  puedePagarEncomienda,
} from '@/src/utils/estados';
import { humanizeError } from '@/src/utils/errores';
import { formatMoney, formatNumeroVE, tasaRefDe } from '@/src/utils/dinero';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { useVolver } from '@/src/hooks/useVolver';
import {
  cargarPagosEncomienda,
  describirPunto,
  textoTasaCambio,
  usePagoEncomienda,
  useSucursalesEncomienda,
  type PagoEncomienda,
} from '@/src/hooks/useEncomiendas';
import type { Encomienda } from '@/src/types';
import { Colors, Radius, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';

/** Ceja del detalle = nombre del segmento de la lista (AN-07). */
const CEJA = 'Enviada';

/**
 * El cliente solo puede cancelar antes de entregar el paquete en taquilla
 * (`aa_proteger_encomiendas_cliente`). Después lo cancela la cooperativa.
 */
const CANCELABLE = ['PENDIENTE_DE_ESCANEO'];
/** Ya en manos de la cooperativa: la app no puede cancelarlo. */
const EN_TAQUILLA = ['EN_RECEPCION', 'POR_PAGAR', 'PAGADA'];
/** Envío cerrado: ya no tiene sentido avisar a quien recibe. */
const CERRADA = ['ENTREGADA', 'CANCELADA', 'DEVUELTA'];

interface HistorialRow {
  id: string;
  estado_nuevo: string;
  created_at: string;
}

type EncomiendaDetalle = Encomienda & { cooperativas?: { nombre: string } | null };

export default function DetalleEnvioScreen() {
  const { id, recien } = useLocalSearchParams<{ id: string; recien?: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirmar = useConfirm();
  const { user } = useAuth();
  const { tasaRef } = useTasaBCV();
  const volver = useVolver('/(tabs)/encomiendas?vista=enviadas');

  const [encomienda, setEncomienda] = useState<EncomiendaDetalle | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [pagos, setPagos] = useState<PagoEncomienda[]>([]);
  const [fotoCliente, setFotoCliente] = useState<string | null>(null);
  const [fotoTaquilla, setFotoTaquilla] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** Sin fila (enlace viejo o de otra cuenta): vacío con salida, no "Reintentar". */
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [actualizadoAt, setActualizadoAt] = useState<number | null>(null);
  /** M-47: con "Paga quien recibe" el pago del remitente es opcional y va plegado. */
  const [pagarYo, setPagarYo] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (retries = 3): Promise<void> => {
      if (!id) return;
      const cacheKey = `cache:encomienda_envio:${id}`;
      let reintentando = false;

      try {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && isMountedRef.current) {
            const parsed = JSON.parse(cached);
            setEncomienda((prev) => prev ?? parsed.encomienda ?? null);
            setHistorial((prev) => (prev.length ? prev : (parsed.historial ?? [])));
            setPagos((prev) => (prev.length ? prev : (parsed.pagos ?? [])));
            setActualizadoAt((prev) => prev ?? parsed.at ?? null);
            setLoading(false);
          }
        } catch {
          // Caché ilegible: manda la carga de red.
        }

        const [encResult, histResult, pagosResult] = await Promise.all([
          supabase.from('encomiendas').select('*, cooperativas ( nombre )').eq('id', id).single(),
          supabase
            .from('encomienda_estado_historial')
            .select('id, estado_nuevo, created_at')
            .eq('encomienda_id', id)
            .order('created_at', { ascending: true })
            .limit(20),
          cargarPagosEncomienda(id).then(
            (data) => ({ data, error: null as unknown }),
            (error: unknown) => ({ data: null, error })
          ),
        ]);

        if (encResult.error || !encResult.data) {
          // La fila puede no estar visible inmediatamente tras el insert.
          if (retries > 0) {
            // Sin `setLoading(false)` hasta el último intento: no mostrar
            // "no encontrada" justo después de crearla.
            reintentando = true;
            setTimeout(() => {
              if (isMountedRef.current) fetchData(retries - 1);
            }, 700);
            return;
          }
          throw encResult.error ?? new Error('Encomienda no encontrada');
        }

        if (!isMountedRef.current) return;

        const freshPagos = pagosResult.data;
        const ahora = Date.now();
        const enc = encResult.data as EncomiendaDetalle;
        setEncomienda(enc);
        setHistorial(histResult.data ?? []);
        // Sin pagos (fallo puntual) se conservan los anteriores; el cobro se deduce del estado.
        if (freshPagos) setPagos(freshPagos);
        setErrorCarga(null);
        setActualizadoAt(ahora);

        AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            at: ahora,
            encomienda: enc,
            historial: histResult.data ?? [],
            pagos: freshPagos ?? [],
          })
        ).catch(() => {});

        // Fotos del bucket privado: URL firmada; si falla, simplemente no se muestran.
        const [cliente, taquilla] = await Promise.all([
          urlFotoEncomienda(enc.foto_cliente_path),
          urlFotoEncomienda(enc.foto_evidencia_url),
        ]);
        if (isMountedRef.current) {
          setFotoCliente(cliente);
          setFotoTaquilla(taquilla);
        }
      } catch (err) {
        if (__DEV__) console.warn('[enviar] Error cargando encomienda:', err);
        if (isMountedRef.current) setErrorCarga(humanizeError(err, 'carga'));
        if (isMountedRef.current) setNoEncontrada((err as { code?: string } | null)?.code === 'PGRST116');
      } finally {
        if (isMountedRef.current && !reintentando) setLoading(false);
      }
    },
    [id]
  );

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
      setPagarYo(false);
      fetchData();
    },
    onDesactualizada: () => {
      fetchData();
    },
  });

  const cobro = useMemo(() => getCobroEncomienda(encomienda, pagos), [encomienda, pagos]);
  const puntos = useSucursalesEncomienda(encomienda);

  const handleCancel = async () => {
    if (cancelando) return;
    const ok = await confirmar({
      titulo: '¿Cancelar este envío?',
      mensaje: 'El código QR dejará de servir en la taquilla.',
      confirmar: 'Cancelar envío',
    });
    if (!ok) return;
    setCancelando(true);
    try {
      const { data, error } = await supabase
        .from('encomiendas')
        .update({ estado: 'CANCELADA' })
        .eq('id', id)
        .eq('estado', 'PENDIENTE_DE_ESCANEO')
        .select('id');
      if (error) throw error;
      if (!data?.length) {
        // Ninguna fila: la taquilla lo recibió mientras decidías.
        toast.show(
          'error',
          'No pudimos cancelar: el paquete ya está en la taquilla. Si necesitas cancelarlo, habla con la cooperativa.'
        );
        fetchData();
        return;
      }
      toast.show('success', 'Cancelamos tu envío.');
      volver();
    } catch (err) {
      toast.show('error', `No pudimos cancelar la encomienda. ${humanizeError(err, 'encomienda')}`);
      fetchData();
    } finally {
      if (isMountedRef.current) setCancelando(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader variant="compact" eyebrow={CEJA} title="Encomienda" onBack={volver} />
        <ScreenSkeleton variante="detalle" />
      </Screen>
    );
  }

  if (!encomienda) {
    return (
      <Screen>
        <ScreenHeader variant="compact" eyebrow={CEJA} title="Encomienda" onBack={volver} />
        {noEncontrada ? (
          <EmptyState
            icon={Package}
            title="Encomienda no encontrada"
            description="Puede ser de otra cuenta o ya no estar disponible."
            action={{
              children: 'Ir a Mis encomiendas',
              icon: Package,
              onPress: () => router.dismissTo('/(tabs)/encomiendas?vista=enviadas'),
            }}
          />
        ) : (
          <ErrorState
            title="No pudimos cargar la encomienda"
            description={errorCarga ?? 'No la encontramos en tu cuenta. Revisa tu conexión.'}
            onRetry={() => fetchData(0)}
          />
        )}
      </Screen>
    );
  }

  const estadoVisual = getEstadoVisual('encomienda', encomienda.estado);
  const costo = Number(encomienda.costo_calculado);
  const pagaDestino = encomienda.modalidad_pago === 'DESTINO';
  const destinatario = encomienda.receiver_nombre?.trim() || 'Quien recibe';
  const nombreCoop = encomienda.cooperativas?.nombre ?? null;
  const tracking = encomienda.tracking_id ?? null;
  const puedePagar = !pago.pagoDeOtro && puedePagarEncomienda(encomienda, cobro, 'remitente');
  /** ORIGEN: el remitente debe pagar. DESTINO: solo si decide pagarlo él (M-47). */
  const mostrarFormulario = puedePagar && (!pagaDestino || pagarYo);
  const pagoVisible = cobro.pago;
  /** Con la política de la fase 3 vemos también el pago de quien recibe. */
  const pagoEsMio = !pagoVisible?.pagador_id || pagoVisible.pagador_id === user?.id;
  const costoTexto = costo > 0 ? formatMoney({ usd: costo, tasa: tasaRef }).principal : null;

  const puntoEntrega = describirPunto(puntos.origen, {
    preferidaId: encomienda.sucursal_origen_id,
    cooperativa: nombreCoop,
    ciudad: formatCity(encomienda.ciudad_origen),
  });
  const puntoRetiro = describirPunto(puntos.destino, {
    preferidaId: encomienda.sucursal_destino_id,
    cooperativa: nombreCoop,
    ciudad: formatCity(encomienda.ciudad_destino),
  });

  const porEntregar = encomienda.estado === 'PENDIENTE_DE_ESCANEO';

  const puedeAvisar =
    !CERRADA.includes(encomienda.estado) && telefonoValido(encomienda.receiver_telefono ?? '');

  const avisarDestinatario = async () => {
    const nombre = encomienda.receiver_nombre?.trim().split(/\s+/)[0] || '';
    const mensaje = `Hola${nombre ? ` ${nombre}` : ''}, te envié una encomienda por ${
      nombreCoop ?? 'EnBus'
    }${tracking ? ` (${tracking})` : ''}. Cuando llegue a ${
      formatCity(encomienda.ciudad_destino) || 'tu ciudad'
    }, retírala en ${puntoRetiro.completo} con tu cédula y tu PIN. Puedes seguirla en la app EnBus.`;
    const ok = await abrirWhatsApp(encomienda.receiver_telefono ?? '', mensaje);
    if (!ok) toast.show('error', 'No pudimos abrir WhatsApp. Revisa que esté instalado.');
  };

  const reportar = () =>
    router.push({
      pathname: '/ayuda',
      params: { tipo: 'encomienda', id: encomienda.id, codigo: tracking ?? '' },
    });

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        eyebrow={CEJA}
        title={tracking ?? 'Encomienda'}
        onBack={volver}
        status={<StatusBadge dominio="encomienda" estado={encomienda.estado} />}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ top: Spacing['2xl'] })}
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
        {errorCarga ? <StaleBanner actualizadoAt={actualizadoAt} onRetry={() => fetchData(0)} /> : null}

        {/* ── Recién creada (#31): qué hacer ahora. Por entregar, el QR ya lo dice. */}
        {recien === '1' && porEntregar ? (
          <AvisoCobro tone="success" icon={CheckCircle} titulo="¡Encomienda registrada!">
            {`Llévala a ${puntoEntrega.completo} y muestra este código.`}
          </AvisoCobro>
        ) : !porEntregar && estadoVisual.hint ? (
          <Text variant="secondary" color="muted" style={s.hint}>
            {estadoVisual.hint}
          </Text>
        ) : null}

        {/* ── QR de entrega: codifica el código de seguimiento (DS-09) ─ */}
        {porEntregar && (
          <Card tone="sunken" style={s.card}>
            <Text variant="subheading" align="center" style={s.cardTitle}>
              Muestra este código en la taquilla
            </Text>
            <View style={s.qr}>
              <QRCodeViewer
                data={qrEncomienda(encomienda)}
                codigoLegible={tracking ?? undefined}
                ampliable
                size={220}
              />
            </View>
            <Divider spacing={Spacing.lg} />
            <View style={s.puntoRow}>
              <Storefront size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
              <View style={s.flex}>
                <Text variant="caption" color="muted">
                  Dónde entregarla
                </Text>
                <Text variant="bodyStrong">{capitalizarInicio(puntoEntrega.completo)}</Text>
                {puntoEntrega.detalle ? (
                  <Text variant="caption" color="muted">
                    {puntoEntrega.detalle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        )}

        {/* ── Avisar a quien recibe (APP-46) ─────────────────────────── */}
        {puedeAvisar ? (
          <Button
            variant="outline"
            icon={WhatsappLogo}
            fullWidth
            onPress={avisarDestinatario}
            style={s.card}
          >
            {`Avisar a ${destinatario.split(/\s+/)[0]}`}
          </Button>
        ) : null}

        {/* ── Cobro ───────────────────────────────────────────────────── */}
        {cobro.estado === 'PAGADO' ? (
          <AvisoCobro tone="success" icon={CheckCircle} titulo="Pago confirmado">
            {pagaDestino
              ? pagoVisible && !pagoEsMio
                ? `${destinatario} ya pagó. Para retirarla solo necesita su PIN y su cédula.`
                : 'Quien recibe solo necesita su PIN y su cédula para retirarla.'
              : 'El envío está pagado.'}
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
              ? `${destinatario} registró el pago y la cooperativa lo está revisando.`
              : pagoVisible?.numero_referencia
                ? `Referencia ${pagoVisible.numero_referencia}. Te avisaremos cuando la cooperativa lo confirme.`
                : 'Te avisaremos cuando la cooperativa lo confirme.'}
          </AvisoCobro>
        ) : pago.pagoDeOtro ? (
          <AvisoCobro tone="progress" icon={Info} titulo="Ya hay un pago registrado">
            {pagaDestino
              ? `${destinatario} ya registró un pago. Si la cooperativa lo rechaza, podrás pagarlo tú.`
              : 'Desliza hacia abajo para actualizar.'}
          </AvisoCobro>
        ) : cobro.estado === 'NO_APLICA' ? null : pagaDestino ? (
          <AvisoCobro
            tone="neutral"
            icon={UserCircle}
            titulo={MODALIDAD_PAGO.DESTINO.corto}
            extra={
              puedePagar && !pagarYo ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setPagarYo(true)}
                  style={s.avisoAction}
                >
                  Prefiero pagarlo yo
                </Button>
              ) : null
            }
          >
            {costoTexto
              ? `${destinatario} pagará ${costoTexto} al retirarla.`
              : `${destinatario} lo paga al retirarla.`}
          </AvisoCobro>
        ) : cobro.estado === 'COSTO_PENDIENTE' ? (
          <AvisoCobro tone="neutral" icon={Storefront} titulo={MODALIDAD_PAGO.ORIGEN.corto}>
            La taquilla calcula el costo al pesar el paquete. Pagas ahí o desde la app.
          </AvisoCobro>
        ) : null}

        {cobro.estado === 'RECHAZADO' && !pago.pagoDeOtro ? (
          <AvisoCobro tone="danger" icon={XCircle} titulo="Pago rechazado">
            {`Motivo: ${cobro.motivoRechazo || 'la cooperativa no indicó el motivo.'}${
              !pagoEsMio ? ` Lo había registrado ${destinatario}.` : ''
            } ${pagaDestino ? 'Puedes pagarlo tú o dejar que lo pague al retirarla.' : 'Registra el pago de nuevo.'}`}
          </AvisoCobro>
        ) : null}

        {mostrarFormulario && encomienda.cooperativa_id ? (
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
            {pagaDestino ? (
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onPress={() => setPagarYo(false)}
                style={s.avisoAction}
              >
                Paga quien recibe
              </Button>
            ) : null}
          </View>
        ) : null}

        {/* ── Seguimiento ─────────────────────────────────────────────── */}
        <Card tone="sunken" style={s.card}>
          <Text variant="subheading">Seguimiento</Text>
          <StatusTimeline
            estados={buildEncomiendaTimeline(encomienda.estado, historial, {
              creadaAt: encomienda.created_at,
            })}
          />
        </Card>

        {/* ── Detalles ────────────────────────────────────────────────── */}
        <Card tone="sunken" style={s.card}>
          <Text variant="subheading">Detalles</Text>

          {/* Mismo orden de filas que el detalle de "Para mí". */}
          <View style={s.row}>
            <InfoRow label="Contenido" value={encomienda.descripcion_contenido || 'Sin descripción'} />
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

          <View style={s.costRow}>
            <View style={s.flex}>
              <Text variant="caption" color="muted">
                Costo del envío
              </Text>
              <Text variant="bodyStrong">
                {encomienda.modalidad_pago
                  ? MODALIDAD_PAGO[encomienda.modalidad_pago].corto
                  : 'Por definir'}
              </Text>
            </View>
            {costo > 0 ? (
              <Monto usd={costo} size="sm" align="right" />
            ) : (
              <Text variant="bodyStrong" align="right">
                Por calcular
              </Text>
            )}
          </View>

          <Divider spacing={Spacing.xs} />

          {/* Mismo trayecto que la fila de la lista y el resumen del asistente. */}
          <InfoRow
            label="Trayecto"
            value={`${formatCity(encomienda.ciudad_origen) || '—'} → ${formatCity(encomienda.ciudad_destino) || '—'}`}
          />

          <Divider spacing={Spacing.xs} />

          <InfoRow label="Quien recibe" value={encomienda.receiver_nombre || 'Sin nombre'} />
          <Divider spacing={Spacing.xs} />
          <View style={[s.puntoRow, s.puntoRowDetalles]}>
            <Storefront size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
            <View style={s.flex}>
              <Text variant="caption" color="muted">
                Dónde la retira
              </Text>
              <Text variant="bodyStrong">{capitalizarInicio(puntoRetiro.completo)}</Text>
              {puntoRetiro.detalle ? (
                <Text variant="caption" color="muted">
                  {puntoRetiro.detalle}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {/* ── Fotos ───────────────────────────────────────────────────── */}
        {fotoCliente || fotoTaquilla ? (
          <Card tone="sunken" style={s.card}>
            <Text variant="subheading" style={s.cardTitle}>
              Fotos
            </Text>
            {fotoCliente ? (
              <>
                <Image
                  source={{ uri: fotoCliente }}
                  style={s.photo}
                  resizeMode="cover"
                  accessibilityLabel="Foto que subiste"
                />
                <Text variant="caption" color="muted" style={s.photoCaption}>
                  La que subiste al registrarla
                </Text>
              </>
            ) : null}
            {fotoTaquilla ? (
              <>
                <Image
                  source={{ uri: fotoTaquilla }}
                  style={[s.photo, fotoCliente ? s.photoSecond : null]}
                  resizeMode="cover"
                  accessibilityLabel="Foto que tomó la taquilla"
                />
                <Text variant="caption" color="muted" style={s.photoCaption}>
                  La que tomó la taquilla al recibirla
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* ── Acciones ────────────────────────────────────────────────── */}
        {CANCELABLE.includes(encomienda.estado) && (
          <Button variant="dangerGhost" fullWidth loading={cancelando} onPress={handleCancel}>
            Cancelar envío
          </Button>
        )}

        {EN_TAQUILLA.includes(encomienda.estado) && (
          <Text variant="caption" color="muted" align="center">
            Ya está en la taquilla. Para cancelarla, habla con la cooperativa.
          </Text>
        )}

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
    <Card tone="sunken" style={s.card} accessibilityRole="summary">
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
    marginBottom: Spacing['2xl'],
  },
  card: {
    marginBottom: Spacing['2xl'],
  },
  cardTitle: {
    marginBottom: Spacing.lg,
  },
  qr: {
    alignItems: 'center',
  },
  puntoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  puntoRowDetalles: {
    paddingTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
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
  avisoAction: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.lg,
  },
  photoSecond: {
    marginTop: Spacing.lg,
  },
  photoCaption: {
    marginTop: Spacing.sm,
  },
  reportar: {
    alignItems: 'center',
    marginTop: Spacing['2xl'],
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
