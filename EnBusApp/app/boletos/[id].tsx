import { SafeAreaView } from '@/tw';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View, Text, Pressable } from '@/tw';
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

export default function DetalleBoletoScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const toast = useToast();

  const { user } = useAuth();
  const [boleto, setBoleto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [motivo, setMotivo] = useState('');

  const viewShotRef = useRef<any>(null);

  const handleSharePass = async () => {
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
          setBoleto(data);
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
      const expiry = new Date(boleto.reserva_expira_at).getTime();
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
  }, [boleto?.reserva_expira_at, boleto?.estado]);

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
          cooperativa_id: boleto.cooperativa_id,
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
    if (!motivo.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'Por favor ingresa un motivo para la cancelación');
      return;
    }

    try {
      setCanceling(true);
      const refundAmount = boleto.precio * 0.95;
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
        <Text className="text-muted-foreground font-bold">Boleto no encontrado</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-6 py-3 bg-secondary rounded-full">
          <Text className="text-foreground">Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const ruta = boleto.viajes?.rutas;
  const cooperativa = boleto.cooperativas;
  const pasajero = boleto.profiles;
  const horasDuration = Math.floor((ruta?.duracion_estimada_min || 0) / 60);
  const minDuration = (ruta?.duracion_estimada_min || 0) % 60;

  const acronym = (city: string) => city ? formatCity(city).substring(0, 3).toUpperCase() : 'UNK';

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Navbar Custom */}
      <View className="px-6 pt-4 pb-4 bg-background flex-row justify-between items-center border-b border-border">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()} className="size-10 bg-secondary rounded-full flex items-center justify-center">
            <CaretLeft weight="bold" color="#171717" size={24} />
          </Pressable>
          <View>
            <Text className="text-sm font-bold text-muted-foreground uppercase">Boarding Pass</Text>
            <Text className="font-heading text-xl text-foreground">{boleto.codigo_boleto}</Text>
          </View>
        </View>
        <View className={`px-3 py-1 rounded-full ${
          boleto.estado === 'PAGADO' ? 'bg-success-light' : 
          boleto.estado === 'RESERVADO' ? 'bg-warning-light' : 
          boleto.estado === 'CANCELADO' ? 'bg-destructive-light' : 'bg-secondary'
        }`}>
          <Text className={`font-bold text-xs ${
            boleto.estado === 'PAGADO' ? 'text-success' : 
            boleto.estado === 'RESERVADO' ? 'text-warning' : 
            boleto.estado === 'CANCELADO' ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {boleto.estado === 'PAGADO' ? 'CONFIRMADO' :
             boleto.estado === 'RESERVADO' ? 'RESERVADO' :
             boleto.estado === 'USADO' ? 'VIAJE COMPLETADO' :
             boleto.estado === 'CANCELADO' ? 'CANCELADO' : 'EXPIRADO'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {/* Temporizador dinámico para boletos RESERVADO */}
        {boleto.estado === 'RESERVADO' && timeLeft && (
          <View className="mb-4 bg-warning-light border border-warning/20 p-4 rounded-[14px] flex-row items-center gap-3">
            <Clock size={20} color="#f59e0b" weight="fill" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-warning uppercase mb-0.5">Pendiente de Pago</Text>
              <Text className="text-xs text-neutral-700 leading-4">
                Paga antes de que expire el tiempo para confirmar tu boleto.
              </Text>
            </View>
            <View className="bg-warning px-3 py-1.5 rounded-lg">
              <Text className="text-xs font-black text-white">{timeLeft}</Text>
            </View>
          </View>
        )}

        {/* Banner para boletos EXPIRADOS */}
        {boleto.estado === 'EXPIRADO' && (
          <View className="mb-4 bg-secondary p-4 rounded-[14px] flex-row items-center gap-3 border border-border/50">
            <Clock size={20} color="#737373" weight="fill" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-muted-foreground uppercase mb-0.5">Reserva Expirada</Text>
              <Text className="text-xs text-muted-foreground leading-4">
                El tiempo límite para realizar el pago de esta reserva ha expirado. El asiento ha sido liberado.
              </Text>
            </View>
          </View>
        )}

        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
          <View className="bg-card rounded-[14px] overflow-hidden border border-border mb-6">

          {/* Header del Ticket */}
          <View className="bg-primary p-6 items-center">
            <Text className="text-primary-foreground/80 font-bold uppercase tracking-widest text-xs mb-1">Cooperativa</Text>
            <Text className="text-primary-foreground font-heading text-xl">{cooperativa?.nombre || 'Indefinida'}</Text>
          </View>

          {/* Rutas (Origen -> Destino) */}
          <View className="p-6 border-b border-dashed border-border/50 flex-row justify-between items-center">
            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1}>{acronym(ruta?.ciudad_origen)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1}>{formatCity(ruta?.ciudad_origen)}</Text>
            </View>

            <View className="flex-1 items-center justify-center border-t-2 border-dashed border-muted mx-4 relative">
              <View className="w-6 h-6 bg-secondary rounded-full items-center justify-center absolute -top-3">
                <Clock color="#a3a3a3" weight="fill" size={14} />
              </View>
              <Text className="text-[10px] text-muted-foreground font-bold mt-4 uppercase text-center">
                {horasDuration}h {minDuration}m
              </Text>
            </View>

            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1}>{acronym(ruta?.ciudad_destino)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1}>{formatCity(ruta?.ciudad_destino)}</Text>
            </View>
          </View>

          {/* Detalles del Viaje */}
          <View className="p-6 flex-row flex-wrap border-b border-border/30">
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Pasajero</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1}>{pasajero?.nombre_completo}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">C.I / Pasaporte</Text>
              <Text className="text-sm text-foreground font-black">{pasajero?.cedula_rif}</Text>
            </View>
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Fecha de Salida</Text>
              <Text className="text-sm text-foreground font-black">{formatDate(boleto.viajes?.fecha_hora_salida, dateFull)}</Text>
              <Text className="text-xs text-muted-foreground">{formatDate(boleto.viajes?.fecha_hora_salida, timeOnly)}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Asiento</Text>
              <Text className="text-2xl text-primary font-black">{boleto.asiento}</Text>
            </View>
            <View className="w-1/2 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Unidad</Text>
              <Text className="text-sm text-foreground font-black">{boleto.viajes?.numero_unidad || 'N/A'}</Text>
            </View>
            <View className="w-1/2 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Chófer</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1}>{boleto.viajes?.nombre_chofer || 'Por asignar'}</Text>
            </View>
          </View>

          {/* QR Integrado */}
          <View className="p-6 items-center bg-secondary/30">
            {boleto.estado === 'PAGADO' ? (
              <>
                <Text className="text-xs text-muted-foreground font-bold mb-4 uppercase text-center w-3/4">
                  Pase oficial de abordaje. Escanee antes de subir.
                </Text>
                <QRCodeViewer data={`PASS-${boleto.codigo_boleto}`} size={160} autoMaxBrightness={false} />
              </>
            ) : boleto.estado === 'RESERVADO' ? (
              <View className="items-center py-4">
                <Text className="text-sm font-bold text-warning mb-2 uppercase text-center">
                  Pago en Verificación
                </Text>
                <Text className="text-xs text-muted-foreground text-center w-3/4">
                  El QR de abordaje se generará una vez que la cooperativa valide tu pago.
                </Text>
              </View>
            ) : (
              <View className="items-center py-4">
                <Text className="text-sm font-bold text-muted-foreground mb-2 uppercase text-center">
                  Boleto {boleto.estado === 'USADO' ? 'VIAJADO' : boleto.estado}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ViewShot>

        {/* Botones de acción/cancelación y Calificación */}
        {boleto.estado === 'PAGADO' && (
          <Pressable
            onPress={handleSharePass}
            className="bg-primary h-12 rounded-[10px] items-center justify-center mt-2 mb-2 flex-row gap-2"
          >
            <Text className="text-primary-foreground font-bold">Compartir Pase de Abordaje</Text>
          </Pressable>
        )}

        {boleto.estado === 'RESERVADO' && (
          <Pressable
            onPress={handleCancelReserva}
            disabled={canceling}
            className="bg-destructive/10 border border-destructive/20 h-12 rounded-[10px] items-center justify-center mt-2 flex-row gap-2"
          >
            <Text className="text-destructive font-bold">Cancelar Reserva</Text>
          </Pressable>
        )}

        {boleto.estado === 'PAGADO' && (
          <Pressable
            onPress={() => setIsCancelModalVisible(true)}
            disabled={canceling}
            className="bg-destructive/10 border border-destructive/20 h-12 rounded-[10px] items-center justify-center mt-2 flex-row gap-2"
          >
            <Text className="text-destructive font-bold">Solicitar Cancelación (95% Reembolso)</Text>
          </Pressable>
        )}

        {boleto.estado === 'CANCELADO' && (
          <View className="bg-secondary rounded-[10px] p-4 border border-border/50">
            <Text className="text-sm font-bold text-foreground mb-1">Detalle de Cancelación</Text>
            {boleto.motivo_cancelacion && (
              <Text className="text-xs text-muted-foreground mb-2">Motivo: {boleto.motivo_cancelacion}</Text>
            )}
            {boleto.monto_reembolso ? (
              <Text className="text-xs text-muted-foreground">Reembolso estimado: {Number(boleto.monto_reembolso).toFixed(2)} Bs.</Text>
            ) : (
              <Text className="text-xs text-muted-foreground">Cancelado sin costo</Text>
            )}
          </View>
        )}

        {boleto.estado === 'USADO' && (
          <View className="p-5 bg-card rounded-[14px] border border-border shadow-sm">
            <Text className="font-heading text-lg text-foreground mb-1">
              Califica tu Viaje
            </Text>
            <Text className="text-xs text-muted-foreground mb-4">
              Cuéntanos tu experiencia viajando con {cooperativa?.nombre}.
            </Text>

            {loadingCalificacion ? (
              <ActivityIndicator size="small" color="#e2b714" />
            ) : calificacion ? (
              <View className="gap-2">
                <StarRating rating={calificacion.estrellas} readonly={true} />
                {calificacion.comentario ? (
                  <View className="bg-secondary p-3 rounded-lg mt-1 border border-border/30">
                    <Text className="text-sm text-foreground italic">
                      "{calificacion.comentario}"
                    </Text>
                  </View>
                ) : null}
                <Text className="text-[10px] text-success font-bold mt-1 uppercase">
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
                  placeholderTextColor="#a1a1aa"
                  value={comentarioCalificacion}
                  onChangeText={setComentarioCalificacion}
                  multiline
                  numberOfLines={2}
                  editable={!submittingCalificacion}
                />

                <Pressable
                  onPress={handleSubmitCalificacion}
                  disabled={selectedStars === 0 || submittingCalificacion}
                  className={`h-12 rounded-[10px] items-center justify-center mt-2 flex-row gap-2 ${
                    selectedStars === 0 ? 'bg-primary/50' : 'bg-primary'
                  }`}
                >
                  {submittingCalificacion ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-primary-foreground font-bold">
                      Enviar Calificación
                    </Text>
                  )}
                </Pressable>
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
          <View style={s.modalContainer}>
            <Text className="font-heading text-lg text-foreground mb-2">Motivo de Cancelación</Text>
            <Text className="text-xs text-muted-foreground mb-4 text-center">
              La cancelación de boletos pagados tiene un cargo administrativo del 5%. Recibirás un reembolso de {(boleto.precio * 0.95).toFixed(2)} Bs.
            </Text>
            <TextInput
              style={s.textInput}
              placeholder="Ej: Cambio de planes, problemas de salud..."
              placeholderTextColor="#a1a1aa"
              value={motivo}
              onChangeText={setMotivo}
              multiline
              numberOfLines={3}
            />
            <View className="flex-row gap-3 w-full mt-4">
              <Pressable
                onPress={() => {
                  setIsCancelModalVisible(false);
                  setMotivo(''); // limpiar campo para reaperturas posteriores
                }}
                className="flex-1 bg-secondary h-12 rounded-[10px] items-center justify-center"
              >
                <Text className="text-foreground font-bold">Volver</Text>
              </Pressable>
              <Pressable
                onPress={handleCancelBoletoConfirmado}
                disabled={canceling}
                className="flex-1 bg-destructive h-12 rounded-[10px] items-center justify-center"
              >
                <Text className="text-white font-bold">Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  textInput: {
    width: '100%',
    minHeight: 80,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#171717',
    textAlignVertical: 'top',
  }
});
