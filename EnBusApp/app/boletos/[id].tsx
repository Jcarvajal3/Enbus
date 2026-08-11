import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, ShareNetwork, WarningCircle } from 'phosphor-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StarRating } from '@/src/components/StarRating';
import { PageTransition } from '@/src/components/PageTransition';
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  RouteSummary,
  Screen,
  ScreenHeader,
  StatusBadge,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { dateFull, formatDate, timeOnly } from '@/src/utils/formatters';
import { getEstadoVisual } from '@/src/utils/estados';
import type { Boleto } from '@/src/types';
import { Colors, Radius, Shadows, Sizes, Spacing, alpha } from '@/src/theme';

/** Percentage of the fare returned when a paid ticket is cancelled. */
const REFUND_RATE = 0.95;

export default function DetalleBoletoScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [boleto, setBoleto] = useState<Boleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState<string | undefined>();
  const [timeLeft, setTimeLeft] = useState('');

  const [calificacion, setCalificacion] = useState<{ estrellas: number; comentario?: string } | null>(
    null
  );
  const [loadingCalificacion, setLoadingCalificacion] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);

  // ── Carga (cache primero, red después) ───────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const cacheKey = `cache:boleto:${id}`;

    const run = async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setBoleto(JSON.parse(cached));
          setLoading(false);
        }

        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

        const query = supabase
          .from('boletos')
          .select(
            `id, codigo_boleto, asiento, precio, estado, reserva_expira_at, cooperativa_id,
             comprador_id, motivo_cancelacion, monto_reembolso,
             viajes ( fecha_hora_salida, numero_unidad, nombre_chofer,
                      rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min ) ),
             cooperativas ( nombre ),
             profiles ( nombre_completo, cedula_rif )`
          );

        const { data, error } = await (isUUID
          ? query.eq('id', id)
          : query.eq('codigo_boleto', id)
        ).single();

        if (error) throw error;
        if (!isMounted) return;

        setBoleto(data as unknown as Boleto);
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      } catch (err) {
        if (__DEV__) console.error('[boleto] Error cargando boleto:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [id]);

  // ── Cuenta atrás de la reserva ───────────────────────────────────────────
  useEffect(() => {
    if (!boleto || boleto.estado !== 'RESERVADO' || !boleto.reserva_expira_at) return;

    const tick = () => {
      const diff = new Date(boleto.reserva_expira_at as string).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        setBoleto((prev) => (prev ? { ...prev, estado: 'EXPIRADO' } : prev));
        return false;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      return true;
    };

    tick();
    const interval = setInterval(() => {
      if (!tick()) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
    // Depende sólo de los dos campos que definen la cuenta atrás: incluir el
    // objeto completo reiniciaría el intervalo en cada tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boleto?.reserva_expira_at, boleto?.estado]);

  // ── Calificación previa ──────────────────────────────────────────────────
  useEffect(() => {
    if (!boleto || boleto.estado !== 'USADO') return;
    let isMounted = true;

    setLoadingCalificacion(true);
    supabase
      .from('calificaciones')
      .select('estrellas, comentario')
      .eq('boleto_id', boleto.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error && __DEV__) console.error('[boleto] Error cargando calificación:', error.message);
        if (isMounted) {
          if (data) setCalificacion(data);
          setLoadingCalificacion(false);
        }
      });

    return () => {
      isMounted = false;
    };
    // La calificación sólo debe recargarse si cambia el boleto o su estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boleto?.id, boleto?.estado]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!boleto || !viewShotRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir pase de abordaje',
        UTI: 'public.png',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.show('error', `No se pudo compartir el pase: ${message}`);
    }
  };

  const handleCancelReserva = () => {
    if (!boleto) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Cancelar reserva',
      '¿Seguro que deseas cancelar esta reserva? El asiento se liberará de inmediato.',
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              setCanceling(true);
              const { error } = await supabase
                .from('boletos')
                .update({ estado: 'CANCELADO' })
                .eq('id', boleto.id);
              if (error) throw error;

              setBoleto((prev) => (prev ? { ...prev, estado: 'CANCELADO' } : prev));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show('success', 'Reserva cancelada correctamente');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Error desconocido';
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show('error', `No se pudo cancelar la reserva: ${message}`);
            } finally {
              setCanceling(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelPagado = async () => {
    if (!boleto) return;
    if (!motivo.trim()) {
      setMotivoError('Cuéntanos brevemente el motivo.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      setCanceling(true);
      const refund = (boleto.precio ?? 0) * REFUND_RATE;
      const { error } = await supabase
        .from('boletos')
        .update({
          estado: 'CANCELADO',
          motivo_cancelacion: motivo.trim(),
          monto_reembolso: refund,
        })
        .eq('id', boleto.id);

      if (error) throw error;

      setBoleto((prev) =>
        prev
          ? { ...prev, estado: 'CANCELADO', motivo_cancelacion: motivo.trim(), monto_reembolso: refund }
          : prev
      );
      setCancelSheetVisible(false);
      setMotivo('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Boleto cancelado. El reembolso se procesa en 1–2 días hábiles.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo cancelar el boleto: ${message}`);
    } finally {
      setCanceling(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!user || !boleto || estrellas < 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'Selecciona de 1 a 5 estrellas');
      return;
    }

    try {
      setSubmittingRating(true);
      const { error } = await supabase.from('calificaciones').insert({
        boleto_id: boleto.id,
        usuario_id: user.id,
        cooperativa_id: boleto.cooperativa_id,
        estrellas,
        comentario: comentario.trim() || null,
      });
      if (error) throw error;

      setCalificacion({ estrellas, comentario: comentario.trim() || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', '¡Gracias! Tu calificación fue registrada.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo enviar la calificación: ${message}`);
    } finally {
      setSubmittingRating(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen>
        <LoadingState label="Cargando tu boleto…" />
      </Screen>
    );
  }

  if (!boleto) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Boleto" onBack={() => router.back()} />
        <EmptyState
          icon={WarningCircle}
          title="Boleto no encontrado"
          description="No pudimos encontrar este boleto. Puede que haya sido eliminado."
          action={{ children: 'Volver', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const ruta = boleto.viajes?.rutas;
  const minutos = ruta?.duracion_estimada_min ?? 0;
  const estadoVisual = getEstadoVisual('boleto', boleto.estado);

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          eyebrow="Pase de abordaje"
          title={boleto.codigo_boleto ?? '—'}
          onBack={() => router.back()}
          right={<StatusBadge dominio="boleto" estado={boleto.estado} size="md" bordered />}
        />

        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing.lg })}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Aviso de estado ─────────────────────────────────────────── */}
          {boleto.estado === 'RESERVADO' && timeLeft ? (
            <View style={[s.banner, s.bannerWarning]}>
              <Clock size={Sizes.icon.lg} color={Colors.warning} weight="fill" />
              <View style={s.bannerBody}>
                <Text variant="overline" color="warning" uppercase>
                  Pendiente de pago
                </Text>
                <Text variant="caption" color="muted">
                  Paga antes de que expire el tiempo para confirmar tu boleto.
                </Text>
              </View>
              <View style={s.countdown}>
                <Text variant="label" weight="heavy" color="inverse" compact>
                  {timeLeft}
                </Text>
              </View>
            </View>
          ) : boleto.estado === 'EXPIRADO' || boleto.estado === 'CANCELADO' ? (
            <View style={[s.banner, s.bannerNeutral]}>
              <WarningCircle size={Sizes.icon.lg} color={Colors.mutedForeground} weight="fill" />
              <View style={s.bannerBody}>
                <Text variant="overline" color="muted" uppercase>
                  {estadoVisual.label}
                </Text>
                <Text variant="caption" color="muted">
                  {estadoVisual.hint}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ── Ticket ──────────────────────────────────────────────────── */}
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
            <View style={s.ticket}>
              <View style={s.ticketHeader}>
                <Text variant="overline" color={alpha(Colors.primaryForeground, 0.6)} uppercase>
                  Cooperativa
                </Text>
                <Text variant="heading" align="center" style={s.ticketCoop}>
                  {boleto.cooperativas?.nombre ?? 'Indefinida'}
                </Text>
              </View>

              <View style={s.ticketBody}>
                <RouteSummary
                  origen={ruta?.ciudad_origen}
                  destino={ruta?.ciudad_destino}
                  duration={`${Math.floor(minutos / 60)}h ${minutos % 60}m`}
                />
              </View>

              {/* Perforación */}
              <View style={s.perforation}>
                <View style={[s.notch, s.notchLeft]} />
                <View style={s.dashes} />
                <View style={[s.notch, s.notchRight]} />
              </View>

              <View style={s.ticketDetails}>
                <TicketField label="Pasajero" value={boleto.profiles?.nombre_completo ?? '—'} />
                <TicketField label="C.I. / Pasaporte" value={boleto.profiles?.cedula_rif ?? '—'} />
                <TicketField
                  label="Fecha de salida"
                  value={formatDate(boleto.viajes?.fecha_hora_salida, dateFull)}
                  hint={formatDate(boleto.viajes?.fecha_hora_salida, timeOnly)}
                />
                <TicketField label="Asiento" value={boleto.asiento ?? '—'} highlight />
                <TicketField label="Unidad" value={boleto.viajes?.numero_unidad ?? 'N/A'} />
                <TicketField
                  label="Chófer"
                  value={boleto.viajes?.nombre_chofer ?? 'Por asignar'}
                />
              </View>

              <View style={s.ticketQr}>
                {boleto.estado === 'PAGADO' ? (
                  <>
                    <Text variant="caption" color="muted" align="center" style={s.qrCaption}>
                      Pase oficial de abordaje. Escanéalo antes de subir.
                    </Text>
                    <QRCodeViewer
                      data={`PASS-${boleto.codigo_boleto}`}
                      size={160}
                      autoMaxBrightness={false}
                    />
                  </>
                ) : boleto.estado === 'RESERVADO' ? (
                  <>
                    <Text variant="label" color="warning" align="center" uppercase>
                      Pago en verificación
                    </Text>
                    <Text variant="caption" color="muted" align="center" style={s.qrCaption}>
                      El QR de abordaje se genera cuando la cooperativa valide tu pago.
                    </Text>
                  </>
                ) : (
                  <Text variant="label" color="muted" align="center" uppercase>
                    {estadoVisual.label}
                  </Text>
                )}
              </View>
            </View>
          </ViewShot>

          {/* ── Acciones ────────────────────────────────────────────────── */}
          <View style={s.actions}>
            {boleto.estado === 'PAGADO' && (
              <>
                <Button variant="primary" icon={ShareNetwork} fullWidth onPress={handleShare}>
                  Compartir pase de abordaje
                </Button>
                <Button
                  variant="dangerSoft"
                  fullWidth
                  disabled={canceling}
                  onPress={() => setCancelSheetVisible(true)}
                >
                  {`Solicitar cancelación (${Math.round(REFUND_RATE * 100)}% reembolso)`}
                </Button>
              </>
            )}

            {boleto.estado === 'RESERVADO' && (
              <Button
                variant="dangerSoft"
                fullWidth
                disabled={canceling}
                onPress={handleCancelReserva}
              >
                Cancelar reserva
              </Button>
            )}
          </View>

          {/* ── Detalle de cancelación ──────────────────────────────────── */}
          {boleto.estado === 'CANCELADO' && (
            <Card tone="sunken" padding="md" elevated={false} style={s.block}>
              <Text variant="bodyStrong">Detalle de la cancelación</Text>
              {boleto.motivo_cancelacion ? (
                <Text variant="caption" color="muted" style={s.blockText}>
                  {`Motivo: ${boleto.motivo_cancelacion}`}
                </Text>
              ) : null}
              <Text variant="caption" color="muted">
                {boleto.monto_reembolso
                  ? `Reembolso estimado: ${Number(boleto.monto_reembolso).toFixed(2)} Bs`
                  : 'Cancelado sin costo'}
              </Text>
            </Card>
          )}

          {/* ── Calificación ────────────────────────────────────────────── */}
          {boleto.estado === 'USADO' && (
            <Card padding="md" style={s.block}>
              <Text variant="subheading">Califica tu viaje</Text>
              <Text variant="caption" color="muted" style={s.blockText}>
                {`Cuéntanos cómo estuvo viajar con ${boleto.cooperativas?.nombre ?? 'la cooperativa'}.`}
              </Text>

              {loadingCalificacion ? (
                <LoadingState compact />
              ) : calificacion ? (
                <View style={s.ratingDone}>
                  <StarRating rating={calificacion.estrellas} readonly />
                  {calificacion.comentario ? (
                    <View style={s.quote}>
                      <Text variant="secondary" style={s.quoteText}>
                        {`“${calificacion.comentario}”`}
                      </Text>
                    </View>
                  ) : null}
                  <Text variant="overline" color="success" uppercase>
                    Ya calificaste este viaje
                  </Text>
                </View>
              ) : (
                <View style={s.ratingForm}>
                  <StarRating
                    rating={estrellas}
                    onRatingChange={setEstrellas}
                    readonly={submittingRating}
                  />
                  <Field
                    placeholder="¿Cómo estuvo el servicio? (opcional)"
                    value={comentario}
                    onChangeText={setComentario}
                    editable={!submittingRating}
                    tone="sunken"
                    multiline
                    numberOfLines={2}
                  />
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={estrellas === 0}
                    loading={submittingRating}
                    onPress={handleSubmitRating}
                  >
                    Enviar calificación
                  </Button>
                </View>
              )}
            </Card>
          )}
        </ScrollView>

        {/* ── Hoja de cancelación ───────────────────────────────────────── */}
        <BottomSheet
          visible={cancelSheetVisible}
          onClose={() => {
            setCancelSheetVisible(false);
            setMotivo('');
            setMotivoError(undefined);
          }}
          title="Motivo de cancelación"
          footer={
            <Button
              variant="danger"
              fullWidth
              loading={canceling}
              onPress={handleCancelPagado}
            >
              Confirmar cancelación
            </Button>
          }
        >
          <View style={s.sheetBody}>
            <Text variant="secondary" color="muted" style={s.sheetIntro}>
              {`Cancelar un boleto pagado tiene un cargo administrativo del ${Math.round(
                (1 - REFUND_RATE) * 100
              )}%. Recibirás ${((boleto.precio ?? 0) * REFUND_RATE).toFixed(2)} Bs.`}
            </Text>
            <Field
              label="Cuéntanos el motivo"
              placeholder="Cambio de planes, problemas de salud…"
              value={motivo}
              onChangeText={(v) => {
                setMotivo(v);
                if (motivoError) setMotivoError(undefined);
              }}
              error={motivoError}
              tone="sunken"
              multiline
              numberOfLines={3}
            />
          </View>
        </BottomSheet>
      </PageTransition>
    </Screen>
  );
}

// ─── Ticket field ────────────────────────────────────────────────────────────

function TicketField({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <View style={s.ticketField}>
      <Text variant="overline" color="muted" uppercase>
        {label}
      </Text>
      {highlight ? (
        <Text variant="title" size="2xl" color="primary" compact>
          {value}
        </Text>
      ) : (
        <Text variant="bodyStrong" size="sm" weight="heavy" numberOfLines={1}>
          {value}
        </Text>
      )}
      {hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const NOTCH = Spacing.xl;

const s = StyleSheet.create({
  // ── Banners
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: Sizes.hairline,
  },
  bannerWarning: {
    backgroundColor: Colors.warningLight,
    borderColor: alpha(Colors.warning, 0.25),
  },
  bannerNeutral: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  bannerBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  countdown: {
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm,
  },

  // ── Ticket
  ticket: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.card,
  },
  ticketHeader: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  ticketCoop: {
    marginTop: Spacing.xs,
  },
  ticketBody: {
    padding: Spacing.xl,
  },
  perforation: {
    height: NOTCH,
    justifyContent: 'center',
  },
  dashes: {
    marginHorizontal: NOTCH / 2,
    borderTopWidth: Sizes.borderStrong,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    top: 0,
  },
  notchLeft: {
    left: -NOTCH / 2,
  },
  notchRight: {
    right: -NOTCH / 2,
  },
  ticketDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  ticketField: {
    width: '50%',
    paddingRight: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.xs / 2,
  },
  ticketQr: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surface,
  },
  qrCaption: {
    maxWidth: 260,
    marginBottom: Spacing.sm,
  },

  // ── Bloques inferiores
  actions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  block: {
    marginTop: Spacing.xl,
  },
  blockText: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  ratingDone: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  ratingForm: {
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  quote: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  quoteText: {
    fontStyle: 'italic',
  },

  // ── Hoja de cancelación
  sheetBody: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  sheetIntro: {
    marginBottom: Spacing.lg,
  },
});
