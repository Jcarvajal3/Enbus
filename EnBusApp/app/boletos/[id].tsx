import { SafeAreaView } from '@/tw';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View, Text, useCSSVariable } from '@/tw';
import { Alert, Modal, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { CaretLeft, Clock } from 'phosphor-react-native';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { formatDate, dateFull, timeOnly, formatCity } from '@/src/utils/formatters';
import { useAuth } from '@/src/contexts/AuthContext';
import { StarRating } from '@/src/components/StarRating';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Boleto } from '@/src/types';
import { PressableScale } from '@/src/components/PressableScale';
import { PageTransition } from '@/src/components/PageTransition';
import { Colors, Typography, Radius, Shadows, Gradients } from '@/src/theme';

export default function DetalleBoletoScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const toast = useToast();
  const foregroundColor = useCSSVariable('--foreground') as string || Colors.foreground;
  const cardColor = useCSSVariable('--card') as string || Colors.white;

  const { user } = useAuth();
  const [boleto, setBoleto] = useState<Boleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [motivo, setMotivo] = useState('');

  const viewShotRef = useRef<any>(null);

  const handleSharePass = async () => {
    if (!boleto) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (!viewShotRef.current) return;
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir Boarding Pass',
        UTI: 'public.png',
      });
    } catch (err: any) {
      console.error('Error sharing boarding pass:', err.message);
      toast.show('error', 'No se pudo compartir el boarding pass: ' + err.message);
    }
  };

  // Estados de reserva y calificaciones
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [calificacion, setCalificacion] = useState<any>(null);
  const [loadingCalificacion, setLoadingCalificacion] = useState(false);
  const [selectedStars, setSelectedStars] = useState(0);
  const [comentarioCalificacion, setComentarioCalificacion] = useState('');
  const [submittingCalificacion, setSubmittingCalificacion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = `cache:boleto:${id}`;

    const loadCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setBoleto(JSON.parse(cached));
          setLoading(false);
        }
      } catch (err) {
        console.warn('Error loading cache for boleto:', err);
      }
    };

    const fetchBoleto = async () => {
      if (!id) return;
      try {
        // Solo mostramos spinner de carga si no hay datos cacheados
        const cached = await AsyncStorage.getItem(cacheKey);
        if (!cached) {
          setLoading(true);
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        
        let query = supabase
          .from('boletos')
          .select(`
            id,
            codigo_boleto,
            asiento,
            precio,
            estado,
            reserva_expira_at,
            cooperativa_id,
            comprador_id,
            motivo_cancelacion,
            monto_reembolso,
            viajes (
              fecha_hora_salida,
              numero_unidad,
              nombre_chofer,
              rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min )
            ),
            cooperativas ( nombre ),
            profiles ( nombre_completo, cedula_rif )
          `);

        if (isUUID) {
          query = query.eq('id', id);
        } else {
          query = query.eq('codigo_boleto', id);
        }

        const { data, error } = await query.single();

        if (error) {
          throw error;
        }

        if (isMounted) {
          setBoleto(data as unknown as Boleto);
          AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch((err) => {
            console.warn('Error saving cache for boleto:', err);
          });
        }
      } catch (err: any) {
        console.error('Error fetching boleto:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCache().then(() => {
      fetchBoleto();
    });

    return () => { isMounted = false; };
  }, [id]);

  // Temporizador dinámico para boletos RESERVADO
  useEffect(() => {
    if (!boleto || boleto.estado !== 'RESERVADO' || !boleto.reserva_expira_at) {
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expiry = new Date((boleto as any).reserva_expira_at as string).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        clearInterval(interval);
        setBoleto((prev: any) => ({ ...prev, estado: 'EXPIRADO' }));
      } else {
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const pad = (n: number) => n < 10 ? `0${n}` : n;
        setTimeLeft(`${pad(minutes)}:${pad(seconds)}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [(boleto as any)?.reserva_expira_at, boleto?.estado]);

  // Carga de calificacion previa para boletos USADO
  useEffect(() => {
    if (!boleto || boleto.estado !== 'USADO') return;

    let isMounted = true;
    const fetchCalificacion = async () => {
      try {
        setLoadingCalificacion(true);
        const { data, error } = await supabase
          .from('calificaciones')
          .select('estrellas, comentario')
          .eq('boleto_id', boleto.id)
          .maybeSingle();

        if (error) throw error;
        if (data && isMounted) {
          setCalificacion(data);
        }
      } catch (err: any) {
        console.error('Error fetching calificacion:', err.message);
      } finally {
        if (isMounted) setLoadingCalificacion(false);
      }
    };

    fetchCalificacion();
    return () => { isMounted = false; };
  }, [boleto?.id, boleto?.estado]);

  // Enviar calificación
  const handleSubmitCalificacion = async () => {
    if (!user || !boleto) return;
    if (selectedStars < 1 || selectedStars > 5) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'Por favor selecciona una calificación de 1 a 5 estrellas');
      return;
    }

    try {
      setSubmittingCalificacion(true);
      const { error } = await supabase
        .from('calificaciones')
        .insert({
          boleto_id: boleto.id,
          usuario_id: user.id,
          cooperativa_id: (boleto as any).cooperativa_id,
          estrellas: selectedStars,
          comentario: comentarioCalificacion.trim() || null,
        });

      if (error) throw error;

      setCalificacion({
        estrellas: selectedStars,
        comentario: comentarioCalificacion.trim() || null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Tu calificación ha sido registrada con éxito');
    } catch (err: any) {
      console.error('Error submitting calificacion:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudo enviar la calificación: ' + err.message);
    } finally {
      setSubmittingCalificacion(false);
    }
  };

  const handleCancelReserva = async () => {
    if (!boleto) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Cancelar Reserva',
      '¿Estás seguro de que deseas cancelar esta reserva de boleto? El asiento se liberará inmediatamente.',
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
              setBoleto((prev: any) => ({ ...prev, estado: 'CANCELADO' }));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show('success', 'Reserva cancelada correctamente');
            } catch (err: any) {
              console.error('Error cancelando reserva:', err.message);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show('error', 'No se pudo cancelar la reserva: ' + err.message);
            } finally {
              setCanceling(false);
            }
          }
        }
      ]
    );
  };

  const handleCancelBoletoConfirmado = async () => {
    if (!boleto) return;
    if (!motivo.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'Por favor ingresa un motivo para la cancelación');
      return;
    }

    try {
      setCanceling(true);
      const refundAmount = (boleto.precio ?? 0) * 0.95;
      const { error } = await supabase
        .from('boletos')
        .update({
          estado: 'CANCELADO',
          motivo_cancelacion: motivo.trim(),
          monto_reembolso: refundAmount,
        })
        .eq('id', boleto.id);

      if (error) throw error;

      setBoleto((prev: any) => ({
        ...prev,
        estado: 'CANCELADO',
        motivo_cancelacion: motivo.trim(),
        monto_reembolso: refundAmount,
      }));

      setIsCancelModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Boleto cancelado. El reembolso del 95% se procesará en 1-2 días hábiles.');
    } catch (err: any) {
      console.error('Error cancelando boleto:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudo cancelar el boleto: ' + err.message);
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Spinner size="large" />
      </SafeAreaView>
    );
  }

  if (!boleto) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Text className="text-muted-foreground font-bold" style={{ fontFamily: Typography.family }}>Boleto no encontrado</Text>
        <PressableScale
          onPress={() => router.back()}
          style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.surface, borderRadius: Radius.full }}
        >
          <Text style={{ color: Colors.foreground, fontFamily: Typography.family, fontWeight: Typography.weights.bold }}>Volver</Text>
        </PressableScale>
      </SafeAreaView>
    );
  }

  const ruta = boleto.viajes?.rutas;
  const cooperativa = boleto.cooperativas;
  const pasajero = boleto.profiles;
  const horasDuration = Math.floor((ruta?.duracion_estimada_min || 0) / 60);
  const minDuration = (ruta?.duracion_estimada_min || 0) % 60;

  const acronym = (city: string | undefined) => city ? formatCity(city).substring(0, 3).toUpperCase() : 'UNK';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <PageTransition>
        {/* Navbar Custom */}
        <View className="px-6 pt-4 pb-4 bg-background flex-row justify-between items-center border-b border-border">
          <View className="flex-row items-center gap-4">
            <PressableScale
              onPress={() => router.back()}
              style={{ width: 40, height: 40, backgroundColor: Colors.surface, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Volver al historial de boletos"
              accessibilityRole="button"
            >
              {/* BUG-08 fix: CSS variable instead of hardcoded #171717 */}
              <CaretLeft weight="bold" color={foregroundColor} size={24} />
            </PressableScale>
            <View>
              <Text className="text-sm font-bold text-muted-foreground uppercase" style={{ fontFamily: Typography.family }}>Boarding Pass</Text>
              <Text className="font-heading text-xl text-foreground" style={{ fontFamily: Typography.family }}>{boleto.codigo_boleto}</Text>
            </View>
          </View>
          <View style={[
            { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
            boleto.estado === 'PAGADO' ? { backgroundColor: 'rgba(22,163,74,0.12)' } :
            boleto.estado === 'RESERVADO' ? { backgroundColor: 'rgba(245,158,11,0.12)' } :
            boleto.estado === 'CANCELADO' ? { backgroundColor: 'rgba(220,38,38,0.10)' } :
            { backgroundColor: Colors.surface },
          ]}>
            <Text style={[
              { fontWeight: Typography.weights.bold, fontSize: 11, fontFamily: Typography.family },
              boleto.estado === 'PAGADO' ? { color: '#16a34a' } :
              boleto.estado === 'RESERVADO' ? { color: Colors.warning } :
              boleto.estado === 'CANCELADO' ? { color: Colors.destructive } :
              { color: Colors.mutedForeground },
            ]}>
              {boleto.estado === 'PAGADO' ? 'CONFIRMADO' :
               boleto.estado === 'RESERVADO' ? 'RESERVADO' :
               boleto.estado === 'USADO' ? 'VIAJE COMPLETADO' :
               boleto.estado === 'CANCELADO' ? 'CANCELADO' : 'EXPIRADO'}
            </Text>
          </View>
        </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 128 }}>
        {/* Temporizador dinámico para boletos RESERVADO */}
        {boleto.estado === 'RESERVADO' && timeLeft && (
          <View className="mb-4 bg-warning-light border border-warning/20 p-4 rounded-[14px] flex-row items-center gap-3">
            <Clock size={20} color={Colors.warning} weight="fill" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-warning uppercase mb-0.5" style={{ fontFamily: Typography.family }}>Pendiente de Pago</Text>
              <Text className="text-xs text-neutral-700 leading-4" style={{ fontFamily: Typography.family }}>
                Paga antes de que expire el tiempo para confirmar tu boleto.
              </Text>
            </View>
            <View className="bg-warning px-3 py-1.5 rounded-lg">
              <Text className="text-xs font-black text-white" style={{ fontFamily: Typography.family }}>{timeLeft}</Text>
            </View>
          </View>
        )}

        {/* Banner para boletos EXPIRADOS */}
        {boleto.estado === 'EXPIRADO' && (
          <View className="mb-4 bg-secondary p-4 rounded-[14px] flex-row items-center gap-3 border border-border/50">
            <Clock size={20} color={Colors.mutedForeground} weight="fill" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-muted-foreground uppercase mb-0.5" style={{ fontFamily: Typography.family }}>Reserva Expirada</Text>
              <Text className="text-xs text-muted-foreground leading-4" style={{ fontFamily: Typography.family }}>
                El tiempo límite para realizar el pago de esta reserva ha expirado. El asiento ha sido liberado.
              </Text>
            </View>
          </View>
        )}

        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
          <View className="bg-card overflow-hidden mb-6" style={[{ borderRadius: Radius.md }, Shadows.card]}>

          {/* Header del Ticket */}
          <View className="bg-primary p-6 items-center">
            <Text className="text-primary-foreground/80 font-bold uppercase tracking-widest text-xs mb-1" style={{ fontFamily: Typography.family }}>Cooperativa</Text>
            <Text className="text-primary-foreground font-heading text-xl" style={{ fontFamily: Typography.family }}>{cooperativa?.nombre || 'Indefinida'}</Text>
          </View>

          {/* Rutas (Origen -> Destino) */}
          <View className="p-6 border-b border-dashed border-border/50 flex-row justify-between items-center">
            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1} style={{ fontFamily: Typography.family }}>{acronym(ruta?.ciudad_origen)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1} style={{ fontFamily: Typography.family }}>{formatCity(ruta?.ciudad_origen)}</Text>
            </View>

            <View className="flex-1 items-center justify-center border-t-2 border-dashed border-muted mx-4 relative">
              <View className="w-6 h-6 bg-secondary rounded-full items-center justify-center absolute -top-3">
                <Clock color={Colors.mutedForeground} weight="fill" size={14} />
              </View>
              <Text className="text-[10px] text-muted-foreground font-bold mt-4 uppercase text-center" style={{ fontFamily: Typography.family }}>
                {horasDuration}h {minDuration}m
              </Text>
            </View>

            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1} style={{ fontFamily: Typography.family }}>{acronym(ruta?.ciudad_destino)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1} style={{ fontFamily: Typography.family }}>{formatCity(ruta?.ciudad_destino)}</Text>
            </View>
          </View>

          {/* Detalles del Viaje */}
          <View className="p-6 flex-row flex-wrap border-b border-border/30">
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>Pasajero</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1} style={{ fontFamily: Typography.family }}>{pasajero?.nombre_completo}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>C.I / Pasaporte</Text>
              <Text className="text-sm text-foreground font-black" style={{ fontFamily: Typography.family }}>{pasajero?.cedula_rif}</Text>
            </View>
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>Fecha de Salida</Text>
              <Text className="text-sm text-foreground font-black" style={{ fontFamily: Typography.family }}>{formatDate(boleto.viajes?.fecha_hora_salida, dateFull)}</Text>
              <Text className="text-xs text-muted-foreground" style={{ fontFamily: Typography.family }}>{formatDate(boleto.viajes?.fecha_hora_salida, timeOnly)}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>Asiento</Text>
              <Text className="text-2xl text-primary font-black" style={{ fontFamily: Typography.family }}>{boleto.asiento}</Text>
            </View>
            <View className="w-1/2 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>Unidad</Text>
              <Text className="text-sm text-foreground font-black" style={{ fontFamily: Typography.family }}>{boleto.viajes?.numero_unidad || 'N/A'}</Text>
            </View>
            <View className="w-1/2 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1" style={{ fontFamily: Typography.family }}>Chófer</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1} style={{ fontFamily: Typography.family }}>{boleto.viajes?.nombre_chofer || 'Por asignar'}</Text>
            </View>
          </View>

          {/* QR Integrado */}
          <View className="p-6 items-center bg-secondary/30">
            {boleto.estado === 'PAGADO' ? (
              <>
                <Text className="text-xs text-muted-foreground font-bold mb-4 uppercase text-center w-3/4" style={{ fontFamily: Typography.family }}>
                  Pase oficial de abordaje. Escanee antes de subir.
                </Text>
                <QRCodeViewer data={`PASS-${boleto.codigo_boleto}`} size={160} autoMaxBrightness={false} />
              </>
            ) : boleto.estado === 'RESERVADO' ? (
              <View className="items-center py-4">
                <Text className="text-sm font-bold text-warning mb-2 uppercase text-center" style={{ fontFamily: Typography.family }}>
                  Pago en Verificación
                </Text>
                <Text className="text-xs text-muted-foreground text-center w-3/4" style={{ fontFamily: Typography.family }}>
                  El QR de abordaje se generará una vez que la cooperativa valide tu pago.
                </Text>
              </View>
            ) : (
              <View className="items-center py-4">
                <Text className="text-sm font-bold text-muted-foreground mb-2 uppercase text-center" style={{ fontFamily: Typography.family }}>
                  Boleto {boleto.estado === 'USADO' ? 'VIAJADO' : boleto.estado}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ViewShot>

        {/* Botones de accion/cancelacion */}
        {boleto.estado === 'PAGADO' && (
          <PressableScale
            onPress={handleSharePass}
            haptic
            hapticType="medium"
            style={{ backgroundColor: Colors.primary, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8, flexDirection: 'row', gap: 8 }}
            accessibilityLabel="Compartir boarding pass como imagen"
            accessibilityRole="button"
          >
            <Text style={{ color: Colors.primaryForeground, fontWeight: Typography.weights.bold, fontSize: 15, fontFamily: Typography.family }}>Compartir Pase de Abordaje</Text>
          </PressableScale>
        )}

        {boleto.estado === 'RESERVADO' && (
          <PressableScale
            onPress={handleCancelReserva}
            disabled={canceling}
            haptic
            style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)', height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 8, flexDirection: 'row', gap: 8 }}
          >
            <Text style={{ color: Colors.destructive, fontWeight: Typography.weights.bold, fontFamily: Typography.family }}>Cancelar Reserva</Text>
          </PressableScale>
        )}

        {boleto.estado === 'PAGADO' && (
          <PressableScale
            onPress={() => setIsCancelModalVisible(true)}
            disabled={canceling}
            haptic
            style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)', height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 8, flexDirection: 'row', gap: 8 }}
          >
            <Text style={{ color: Colors.destructive, fontWeight: Typography.weights.bold, fontFamily: Typography.family }}>Solicitar Cancelacion (95% Reembolso)</Text>
          </PressableScale>
        )}

        {boleto.estado === 'CANCELADO' && (
          <View className="bg-secondary rounded-[10px] p-4 border border-border/50">
            <Text className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: Typography.family }}>Detalle de Cancelación</Text>
            {boleto.motivo_cancelacion && (
              <Text className="text-xs text-muted-foreground mb-2" style={{ fontFamily: Typography.family }}>Motivo: {boleto.motivo_cancelacion}</Text>
            )}
            {boleto.monto_reembolso ? (
              <Text className="text-xs text-muted-foreground" style={{ fontFamily: Typography.family }}>Reembolso estimado: {Number(boleto.monto_reembolso).toFixed(2)} Bs.</Text>
            ) : (
              <Text className="text-xs text-muted-foreground" style={{ fontFamily: Typography.family }}>Cancelado sin costo</Text>
            )}
          </View>
        )}

        {boleto.estado === 'USADO' && (
          <View className="p-5 bg-card rounded-[14px] border border-border shadow-sm">
            <Text className="font-heading text-lg text-foreground mb-1" style={{ fontFamily: Typography.family }}>
              Califica tu Viaje
            </Text>
            <Text className="text-xs text-muted-foreground mb-4" style={{ fontFamily: Typography.family }}>
              Cuéntanos tu experiencia viajando con {cooperativa?.nombre}.
            </Text>

            {loadingCalificacion ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : calificacion ? (
              <View className="gap-2">
                <StarRating rating={calificacion.estrellas} readonly={true} />
                {calificacion.comentario ? (
                  <View className="bg-secondary p-3 rounded-lg mt-1 border border-border/30">
                    <Text className="text-sm text-foreground italic" style={{ fontFamily: Typography.family }}>
                      "{calificacion.comentario}"
                    </Text>
                  </View>
                ) : null}
                <Text className="text-[10px] text-success font-bold mt-1 uppercase" style={{ fontFamily: Typography.family }}>
                  ✓ Ya calificaste este viaje
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                <StarRating
                  rating={selectedStars}
                  onRatingChange={setSelectedStars}
                  readonly={submittingCalificacion}
                />
                
                <TextInput
                  style={s.textInput}
                  placeholder="¿Cómo estuvo el servicio? (Opcional)"
                  placeholderTextColor={Colors.mutedForeground}
                  value={comentarioCalificacion}
                  onChangeText={setComentarioCalificacion}
                  multiline
                  numberOfLines={2}
                  editable={!submittingCalificacion}
                />

                <PressableScale
                  onPress={handleSubmitCalificacion}
                  disabled={selectedStars === 0 || submittingCalificacion}
                  haptic
                  hapticType="medium"
                  style={{
                    height: 48,
                    borderRadius: Radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 8,
                    flexDirection: 'row',
                    gap: 8,
                    backgroundColor: selectedStars === 0 ? 'rgba(255, 199, 87, 0.45)' : Colors.primary,
                  }}
                >
                  {submittingCalificacion ? (
                    <ActivityIndicator size="small" color={Colors.primaryForeground} />
                  ) : (
                    <Text style={{ color: Colors.primaryForeground, fontWeight: Typography.weights.bold, fontSize: 15, fontFamily: Typography.family }}>
                      Enviar Calificacion
                    </Text>
                  )}
                </PressableScale>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal para motivo de cancelación */}
      <Modal
        visible={isCancelModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsCancelModalVisible(false);
          setMotivo(''); // limpiar al cerrar con back button (Android)
        }}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContainer, { backgroundColor: cardColor }]}>
            <Text className="font-heading text-lg text-foreground mb-2" style={{ fontFamily: Typography.family }}>Motivo de Cancelación</Text>
            <Text className="text-xs text-muted-foreground mb-4 text-center" style={{ fontFamily: Typography.family }}>
            La cancelación de boletos pagados tiene un cargo administrativo del 5%. Recibirás un reembolso de {((boleto.precio ?? 0) * 0.95).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
            </Text>
            <TextInput
              style={s.textInput}
              placeholder="Ej: Cambio de planes, problemas de salud..."
              placeholderTextColor={Colors.mutedForeground}
              value={motivo}
              onChangeText={setMotivo}
              multiline
              numberOfLines={3}
            />
            <View className="flex-row gap-3 w-full mt-4">
              <PressableScale
                onPress={() => {
                  setIsCancelModalVisible(false);
                  setMotivo(''); // limpiar campo para reaperturas posteriores
                }}
                style={{ flex: 1, backgroundColor: Colors.surface, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontWeight: Typography.weights.bold, color: Colors.foreground, fontFamily: Typography.family }}>Volver</Text>
              </PressableScale>
              <PressableScale
                onPress={handleCancelBoletoConfirmado}
                disabled={canceling}
                haptic
                hapticType="medium"
                style={{ flex: 1, backgroundColor: Colors.destructive, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: Colors.white, fontWeight: Typography.weights.bold, fontFamily: Typography.family }}>Confirmar</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
      </PageTransition>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContainer: {
    borderRadius: Radius.lg,
    padding: 24,
    alignItems: 'center',
    ...Shadows.card,
  },
  textInput: {
    width: '100%',
    minHeight: 80,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: 12,
    fontSize: 14,
    color: Colors.foreground,
    fontFamily: Typography.family,
    textAlignVertical: 'top',
  }
});
