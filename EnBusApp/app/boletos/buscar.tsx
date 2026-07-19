import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, ScrollView, View, Text } from '@/tw';
import { StyleSheet, Pressable, ActivityIndicator, Modal, Animated, PanResponder, Dimensions } from 'react-native';
import { ArrowLeft, Clock, Star, MapPin, CalendarBlank, SlidersHorizontal, X } from 'phosphor-react-native';
import { LocationSelector } from '@/src/components/LocationSelector';
import { CalendarModal } from '@/src/components/CalendarModal';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatDate, dateFull, timeOnly, formatCity } from '@/src/utils/formatters';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { Colors, Typography, Radius, Spacing, Shadows } from '@/src/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Generador de código de boleto criptográficamente seguro ───────────────────
const BOLETO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateBoletoCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map(b => BOLETO_CHARS[b % BOLETO_CHARS.length])
    .join('');
  return `BOL-${suffix}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BuscarBoletoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const foregroundColor = Colors.foreground;

  // ─── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [origen, setOrigen] = useState<Localidad | null>(
    params.origen ? { ciudad: params.origen as string, estado: '' } : null
  );
  const [destino, setDestino] = useState<Localidad | null>(
    params.destino ? { ciudad: params.destino as string, estado: '' } : null
  );
  const [fecha, setFecha] = useState<Date>(
    params.fecha ? new Date(params.fecha as string) : new Date()
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDates, setActiveDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);

  const [viajes, setViajes] = useState<any[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(false);
  const [viajeSeleccionado, setViajeSeleccionado] = useState<any | null>(null);

  const [asientosSeleccionados, setAsientosSeleccionados] = useState<string[]>([]);
  const [asientosOcupados, setAsientosOcupados] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Filters State ──────────────────────────────────────────────────────────
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedCoop, setSelectedCoop] = useState<string | null>(null);
  const [sortType, setSortType] = useState<'hora_asc' | 'precio_asc' | 'precio_desc'>('hora_asc');

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // ─── PanResponder para Bottom Sheet de Filtros ───────────────────────────────
  const handleOpenFilters = () => {
    setFiltersVisible(true);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 45,
      friction: 7,
    }).start();
  };

  const handleCloseFilters = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setFiltersVisible(false));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.4) {
          handleCloseFilters();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 45,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  // ─── Fetch Active Dates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setActiveDates(null);
      return;
    }
    let isMounted = true;
    const fetchDates = async () => {
      try {
        setLoadingDates(true);
        const { data, error } = await supabase
          .from('viajes')
          .select(`
            fecha_hora_salida,
            rutas!inner ( ciudad_origen, ciudad_destino )
          `)
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('rutas.ciudad_destino', normalizeCityForDb(destino.ciudad))
          .gte('fecha_hora_salida', new Date().toISOString());

        if (error) throw error;

        if (isMounted) {
          const dates = (data || []).map((viaje: any) => {
            const dateObj = new Date(viaje.fecha_hora_salida);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          });
          setActiveDates(Array.from(new Set(dates)));
        }
      } catch (err) {
        console.error('Error fetching active dates:', err);
      } finally {
        if (isMounted) setLoadingDates(false);
      }
    };
    fetchDates();
    return () => { isMounted = false; };
  }, [origen, destino]);

  // ─── Fetch Voyages List ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setViajes([]);
      return;
    }
    let isMounted = true;
    const fetchViajes = async () => {
      try {
        setLoadingViajes(true);
        let query = supabase
          .from('viajes')
          .select(`
            id,
            fecha_hora_salida,
            asientos_disponibles,
            asientos_totales,
            numero_unidad,
            nombre_chofer,
            rutas!inner ( id, ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
            cooperativas ( id, nombre, calificacion_promedio )
          `)
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('rutas.ciudad_destino', normalizeCityForDb(destino.ciudad));

        if (fecha) {
          const startOfDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0).toISOString();
          const endOfDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999).toISOString();
          query = query.gte('fecha_hora_salida', startOfDay).lte('fecha_hora_salida', endOfDay);
        }

        const { data, error } = await query.order('fecha_hora_salida', { ascending: true });
        if (error) throw error;

        const items = (data || []).map((viaje: any) => {
          const dateObj = new Date(viaje.fecha_hora_salida);
          const ruta = Array.isArray(viaje.rutas) ? viaje.rutas[0] : viaje.rutas;
          const cooperativa = Array.isArray(viaje.cooperativas) ? viaje.cooperativas[0] : viaje.cooperativas;
          return {
            id: viaje.id,
            cooperativa_id: cooperativa?.id || '',
            cooperativa: cooperativa?.nombre || 'Desconocida',
            calificacion: cooperativa?.calificacion_promedio || 0,
            horaSalida: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
            duracion: ruta ? `${Math.floor((ruta.duracion_estimada_min || 0) / 60)}h ${(ruta.duracion_estimada_min || 0) % 60}m` : '0h 0m',
            precio: ruta?.precio_pasaje || 0,
            asientosDisponibles: viaje.asientos_disponibles,
            asientosTotales: viaje.asientos_totales,
            numeroUnidad: viaje.numero_unidad,
            nombreChofer: viaje.nombre_chofer,
            rutas: ruta,
            cooperativas: cooperativa,
          };
        });

        if (isMounted) {
          setViajes(items);
        }
      } catch (err) {
        console.error('Error fetching viajes:', err);
      } finally {
        if (isMounted) setLoadingViajes(false);
      }
    };
    fetchViajes();
    return () => { isMounted = false; };
  }, [origen, destino, fecha]);

  // ─── Fetch Occupied Seats for Step 2 ────────────────────────────────────────
  useEffect(() => {
    if (!viajeSeleccionado) return;
    let isMounted = true;
    const fetchAsientos = async () => {
      try {
        const { data, error } = await supabase
          .from('boletos')
          .select('asiento')
          .eq('viaje_id', viajeSeleccionado.id)
          .in('estado', ['RESERVADO', 'PAGADO', 'USADO']);
        if (error) throw error;
        if (isMounted) {
          setAsientosOcupados((data ?? []).map(b => b.asiento));
        }
      } catch (err) {
        console.error('Error fetching occupied seats:', err);
      }
    };
    fetchAsientos();
    return () => { isMounted = false; };
  }, [viajeSeleccionado]);

  // ─── Filtered and Sorted list ───────────────────────────────────────────────
  const cooperativas = useMemo(
    () => Array.from(new Set(viajes.map(r => r.cooperativa))),
    [viajes]
  );

  const filteredAndSorted = useMemo(() => {
    return viajes
      .filter(r => !selectedCoop || r.cooperativa === selectedCoop)
      .sort((a, b) => {
        if (sortType === 'precio_asc') return a.precio - b.precio;
        if (sortType === 'precio_desc') return b.precio - a.precio;
        const timeToMin = (t: string) => {
          const clean = t.replace(/\s*[a-zA-Z]+/g, '').trim();
          const [h, m] = clean.split(':').map(Number);
          const isPM = t.toLowerCase().includes('pm');
          let hours = h;
          if (isPM && h < 12) hours += 12;
          if (!isPM && h === 12) hours = 0;
          return hours * 60 + m;
        };
        return timeToMin(a.horaSalida) - timeToMin(b.horaSalida);
      });
  }, [viajes, selectedCoop, sortType]);

  const handleConfirmSeats = (asientos: string[]) => {
    setAsientosSeleccionados(asientos);
    setStep(3);
  };

  const handlePaymentSuccess = async (pagoId?: string, pagoPayload?: Record<string, unknown>) => {
    if (!user || !viajeSeleccionado) return;
    setIsSubmitting(true);
    try {
      const precioUnitario = viajeSeleccionado.precio;
      const inserts = asientosSeleccionados.map((asiento) => ({
        codigo_boleto: generateBoletoCode(),
        comprador_id: user.id,
        viaje_id: viajeSeleccionado.id,
        cooperativa_id: viajeSeleccionado.cooperativa_id,
        asiento: asiento,
        precio: precioUnitario,
        estado: 'RESERVADO',
        reserva_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }));

      const { data: boletosInsertados, error: boletosError } = await supabase
        .from('boletos')
        .insert(inserts)
        .select('id, codigo_boleto');

      if (boletosError || !boletosInsertados || boletosInsertados.length === 0) {
        throw boletosError || new Error('No se devolvieron los boletos insertados');
      }

      if (pagoPayload) {
        const payloadToInsert = {
          ...pagoPayload,
          boleto_id: boletosInsertados[0].id,
        };

        const { error: pagoInsertError } = await supabase
          .from('pagos')
          .insert(payloadToInsert);

        if (pagoInsertError) {
          console.error('[BuscarBoleto] Pago insert falló:', pagoInsertError);
        }
      }

      router.replace({ pathname: '/boletos/[id]' as any, params: { id: boletosInsertados[0].codigo_boleto } });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudo generar el boleto: ' + err.message);
      console.error('[BuscarBoleto] Error creando boletos:', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    } else {
      router.back();
    }
  };

  const canContinue = () => {
    if (step === 1) return viajeSeleccionado !== null;
    return false;
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header Stepper */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <Pressable
            onPress={handleBack}
            style={s.backBtn}
            accessibilityLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
            accessibilityRole="button"
          >
            <ArrowLeft weight="bold" color={foregroundColor} size={22} />
          </Pressable>
          <View style={s.stepperRow}>
            <View style={s.stepperDotsContainer}>
              {[1, 2, 3].map((s2) => {
                const isActive = s2 === step;
                return (
                  <View
                    key={s2}
                    style={isActive ? s.stepperActivePill : s.stepperInactiveDot}
                  />
                );
              })}
            </View>
            <Text style={s.stepperNumber}>
              {`0${step}`}
            </Text>
          </View>
        </View>
        <Text style={s.headerTitle}>
          {step === 1 ? 'Selecciona tu Viaje' : step === 2 ? 'Selección de Asientos' : 'Confirmar Pago'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={s.formCard}>
          {/* ─── PASO 1: Ubicación y Cooperativa ─── */}
          {step === 1 && (
            <View>
              {/* Buscador de Origen / Destino */}
              <View style={s.searchBarRow}>
                <View style={{ flex: 1 }}>
                  <LocationSelector
                    label=""
                    value={origen}
                    onChange={setOrigen}
                    customTrigger={(openModal) => (
                      <Pressable onPress={openModal} style={s.compactInput}>
                        <MapPin size={14} color={Colors.accent} weight="fill" />
                        <Text style={s.compactInputText} numberOfLines={1}>
                          {origen ? origen.ciudad : 'Origen'}
                        </Text>
                      </Pressable>
                    )}
                  />
                </View>
                <Text style={s.arrowText}>→</Text>
                <View style={{ flex: 1 }}>
                  <LocationSelector
                    label=""
                    value={destino}
                    onChange={setDestino}
                    customTrigger={(openModal) => (
                      <Pressable onPress={openModal} style={s.compactInput}>
                        <MapPin size={14} color={Colors.secondary} weight="fill" />
                        <Text style={s.compactInputText} numberOfLines={1}>
                          {destino ? destino.ciudad : 'Destino'}
                        </Text>
                      </Pressable>
                    )}
                  />
                </View>
              </View>

              {/* Selector de Fecha */}
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={s.dateTrigger}
              >
                <CalendarBlank size={16} color={Colors.accent} weight="bold" />
                <Text style={s.dateTriggerText}>
                  {formatShortDate(fecha)}
                </Text>
              </Pressable>

              {/* Botón de Filtros */}
              {viajes.length > 0 && (
                <PressableScale
                  onPress={handleOpenFilters}
                  haptic
                  style={s.filterTriggerRow}
                >
                  <Text style={s.filterTriggerText}>Filtrar por</Text>
                  <View style={s.filterTriggerIconContainer}>
                    <SlidersHorizontal color={Colors.accent} weight="bold" size={16} />
                    {(selectedCoop !== null || sortType !== 'hora_asc') && (
                      <View style={s.activeFilterDot} />
                    )}
                  </View>
                </PressableScale>
              )}

              {/* Listado de Viajes */}
              <View style={{ marginTop: 12 }}>
                {loadingViajes ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={Colors.accent} />
                  </View>
                ) : viajes.length === 0 ? (
                  <View style={s.emptyState}>
                    <View style={s.emptyCircle}>
                      <CalendarBlank size={32} color={Colors.accent} />
                    </View>
                    <Text style={s.emptyTitle}>Sin rutas activas</Text>
                    <Text style={s.emptySubtitle}>
                      No hay viajes programados para la ruta y fecha seleccionada.
                    </Text>
                  </View>
                ) : filteredAndSorted.length === 0 ? (
                  <View style={s.emptyState}>
                    <View style={s.emptyCircle}>
                      <SlidersHorizontal size={32} color={Colors.accent} />
                    </View>
                    <Text style={s.emptyTitle}>Sin coincidencias</Text>
                    <Text style={s.emptySubtitle}>
                      No hay viajes que cumplan con los filtros seleccionados.
                    </Text>
                  </View>
                ) : (
                  filteredAndSorted.map((v) => {
                    const isSelected = viajeSeleccionado?.id === v.id;
                    const initial = v.cooperativa.substring(0, 1).toUpperCase();
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setViajeSeleccionado(v);
                        }}
                        style={[
                          s.routeCard,
                          isSelected && s.routeCardActive,
                        ]}
                      >
                        <View style={s.routeLeftContent}>
                          <View style={s.routeBadgeRow}>
                            <View style={s.ratingBadge}>
                              <Star weight="fill" color={Colors.primary} size={10} />
                              <Text style={s.ratingBadgeText}>
                                {Number(v.calificacion || 4.8).toFixed(1)}
                              </Text>
                            </View>
                            <Text style={s.asientosDisponiblesText}>
                              {v.asientosDisponibles} asientos libres
                            </Text>
                          </View>
                          <Text style={s.routeTitle}>
                            {v.cooperativa}
                          </Text>
                          <Text style={s.routeSubtitle}>
                            {v.precio} Bs • {v.horaSalida} ({v.duracion})
                          </Text>
                        </View>
                        <View style={[s.routeRightPill, isSelected ? s.routeRightPillActive : s.routeRightPillInactive]}>
                          <Text
                            style={[
                              s.routeRightPillText,
                              { color: isSelected ? Colors.white : Colors.accent }
                            ]}
                          >
                            {initial}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* ─── PASO 2: Selección de Asientos ─── */}
          {step === 2 && viajeSeleccionado && (
            <View>
              {/* Tarjeta de Información del Viaje */}
              <View style={s.infoCard}>
                <View style={s.infoCardHeader}>
                  <Text style={s.infoCardCoopName}>
                    {viajeSeleccionado.cooperativa}
                  </Text>
                  <View style={s.ratingBadge}>
                    <Star weight="fill" color={Colors.primary} size={14} />
                    <Text style={s.ratingText}>
                      {Number(viajeSeleccionado.calificacion || 4.8).toFixed(1)}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-center mb-4">
                  <View className="items-center flex-1">
                    <Text style={s.cityCode}>{formatCity(viajeSeleccionado.rutas?.ciudad_origen).substring(0, 3).toUpperCase()}</Text>
                    <Text style={s.cityName}>{formatCity(viajeSeleccionado.rutas?.ciudad_origen)}</Text>
                  </View>
                  <View style={s.routeMiddle}>
                    <View style={s.routeTimeline}>
                      <View style={s.dotOrigin} />
                      <View style={s.routeLine} />
                      <View style={s.dotDestination} />
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Clock color={Colors.mutedForeground} weight="fill" size={12} />
                      <Text style={s.durationText}>{viajeSeleccionado.duracion}</Text>
                    </View>
                  </View>
                  <View className="items-center flex-1">
                    <Text style={s.cityCode}>{formatCity(viajeSeleccionado.rutas?.ciudad_destino).substring(0, 3).toUpperCase()}</Text>
                    <Text style={s.cityName}>{formatCity(viajeSeleccionado.rutas?.ciudad_destino)}</Text>
                  </View>
                </View>

                <View style={s.infoCardFooter}>
                  <View>
                    <Text style={s.infoLabel}>Fecha</Text>
                    <Text style={s.infoValue}>{formatDate(viajeSeleccionado.fecha_hora_salida, dateFull)}</Text>
                  </View>
                  <View>
                    <Text style={s.infoLabel}>Hora salida</Text>
                    <Text style={s.infoValue}>{viajeSeleccionado.horaSalida}</Text>
                  </View>
                  <View>
                    <Text style={s.infoLabel}>Precio</Text>
                    <Text style={s.priceValue}>{viajeSeleccionado.precio} Bs</Text>
                  </View>
                </View>
              </View>

              <SeatSelector
                viaje_id={viajeSeleccionado.id}
                asientosTotales={viajeSeleccionado.asientosTotales ?? 0}
                asientosOcupados={asientosOcupados}
                precioUnitario={viajeSeleccionado.precio}
                onConfirm={handleConfirmSeats}
              />
            </View>
          )}

          {/* ─── PASO 3: Registro de Pago ─── */}
          {step === 3 && viajeSeleccionado && (
            <View>
              {/* Tarjeta de Detalles */}
              <View style={s.infoCard}>
                <View style={s.infoCardHeader}>
                  <Text style={s.infoCardCoopName}>
                    {viajeSeleccionado.cooperativa}
                  </Text>
                  <Text style={s.infoLabel}>Resumen de Pasaje</Text>
                </View>
                <View className="flex-row justify-between items-center mb-4">
                  <View className="items-center flex-1">
                    <Text style={s.cityCode}>{formatCity(viajeSeleccionado.rutas?.ciudad_origen).substring(0, 3).toUpperCase()}</Text>
                    <Text style={s.cityName}>{formatCity(viajeSeleccionado.rutas?.ciudad_origen)}</Text>
                  </View>
                  <View style={s.routeMiddle}>
                    <View style={s.routeTimeline}>
                      <View style={s.dotOrigin} />
                      <View style={s.routeLine} />
                      <View style={s.dotDestination} />
                    </View>
                  </View>
                  <View className="items-center flex-1">
                    <Text style={s.cityCode}>{formatCity(viajeSeleccionado.rutas?.ciudad_destino).substring(0, 3).toUpperCase()}</Text>
                    <Text style={s.cityName}>{formatCity(viajeSeleccionado.rutas?.ciudad_destino)}</Text>
                  </View>
                </View>
                <View style={s.infoCardFooter}>
                  <View>
                    <Text style={s.infoLabel}>Asientos</Text>
                    <Text style={s.infoValue}>
                      {[...asientosSeleccionados].sort((a, b) => Number(a) - Number(b)).join(', ')}
                    </Text>
                  </View>
                  <View>
                    <Text style={s.infoLabel}>Fecha</Text>
                    <Text style={s.infoValue}>{formatDate(viajeSeleccionado.fecha_hora_salida, dateFull)}</Text>
                  </View>
                  <View>
                    <Text style={s.infoLabel}>Total a Pagar</Text>
                    <Text style={s.priceValue}>{asientosSeleccionados.length * viajeSeleccionado.precio} Bs</Text>
                  </View>
                </View>
              </View>

              <PaymentFlow
                monto={asientosSeleccionados.length * viajeSeleccionado.precio}
                cooperativa_id={viajeSeleccionado.cooperativa_id}
                concepto={`${asientosSeleccionados.length} asiento(s) - ${formatCity(viajeSeleccionado.rutas?.ciudad_origen)} → ${formatCity(viajeSeleccionado.rutas?.ciudad_destino)}`}
                onPaymentSuccess={handlePaymentSuccess}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer CTA */}
      {step === 1 && (
        <View style={s.footer}>
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStep(2);
            }}
            disabled={!canContinue()}
            style={[s.ctaBtn, !canContinue() && s.ctaDisabled]}
          >
            <Text style={s.ctaText}>Continuar</Text>
          </PressableScale>
        </View>
      )}

      {/* Date Picker Modal */}
      <CalendarModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        selectedDate={fecha}
        onSelectDate={(d) => {
          setFecha(d);
          setShowDatePicker(false);
        }}
        activeDates={activeDates}
        loadingDates={loadingDates}
      />

      {/* Modal de Filtros (Bottom Sheet) */}
      <Modal
        animationType="none"
        transparent={true}
        visible={filtersVisible}
        onRequestClose={handleCloseFilters}
      >
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseFilters} />
          <Animated.View
            style={[
              s.sheet,
              { transform: [{ translateY }] },
            ]}
          >
            {/* Draggable Header */}
            <View {...panResponder.panHandlers} style={s.sheetHeader}>
              <View style={s.dragHandle} />
              <View style={s.sheetHeaderContent}>
                <Text style={s.sheetTitle}>Filtrar y Ordenar</Text>
                <PressableScale onPress={handleCloseFilters} style={s.closeButton}>
                  <X color={Colors.foreground} weight="bold" size={20} />
                </PressableScale>
              </View>
            </View>

            <ScrollView contentContainerStyle={s.sheetScrollContent} showsVerticalScrollIndicator={false}>
              {/* Filtro de Cooperativas */}
              <View style={s.filterSection}>
                <Text style={s.sectionTitle}>Filtrar por Cooperativa</Text>
                <View style={s.pillsContainer}>
                  <PressableScale
                    onPress={() => setSelectedCoop(null)}
                    haptic
                    style={[
                      s.filterPill,
                      !selectedCoop ? s.filterPillActive : s.filterPillInactive,
                    ]}
                  >
                    <Text style={[s.pillText, !selectedCoop ? s.pillTextActive : s.pillTextInactive]}>
                      Todas
                    </Text>
                  </PressableScale>
                  {cooperativas.map((coop) => (
                    <PressableScale
                      key={coop}
                      onPress={() => setSelectedCoop(coop)}
                      haptic
                      style={[
                        s.filterPill,
                        selectedCoop === coop ? s.filterPillActive : s.filterPillInactive,
                      ]}
                    >
                      <Text style={[s.pillText, selectedCoop === coop ? s.pillTextActive : s.pillTextInactive]}>
                        {coop}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </View>

              {/* Ordenamiento */}
              <View style={s.filterSection}>
                <Text style={s.sectionTitle}>Ordenar por</Text>
                <View style={s.sortOptionsContainer}>
                  {([
                    { id: 'hora_asc', label: '⏰ Horario' },
                    { id: 'precio_asc', label: '↑ Menor Bs' },
                    { id: 'precio_desc', label: '↓ Mayor Bs' },
                  ] as const).map((opt) => {
                    const isSelected = sortType === opt.id;
                    return (
                      <PressableScale
                        key={opt.id}
                        onPress={() => setSortType(opt.id)}
                        haptic
                        style={[
                          s.sortButton,
                          isSelected ? s.sortButtonActive : s.sortButtonInactive,
                        ]}
                      >
                        <Text style={[s.sortButtonText, isSelected ? s.sortButtonTextActive : s.sortButtonTextInactive]}>
                          {opt.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Botón de Aplicar */}
            <View style={s.applyContainer}>
              <PressableScale
                onPress={handleCloseFilters}
                haptic
                style={s.applyButton}
              >
                <Text style={s.applyButtonText}>Aplicar Filtros</Text>
              </PressableScale>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperActivePill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.foreground,
  },
  stepperInactiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  stepperNumber: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginTop: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 24,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceDark,
    padding: 6,
    borderRadius: Radius.full,
  },
  compactInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    height: 38,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    gap: 6,
  },
  compactInputText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 13,
    color: Colors.foreground,
    flex: 1,
  },
  arrowText: {
    fontSize: 14,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  dateTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    height: 48,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 10,
  },
  dateTriggerText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 14,
    color: Colors.foreground,
    flex: 1,
  },
  filterTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 16,
  },
  filterTriggerText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
  },
  filterTriggerIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  routeCardActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.accent,
  },
  routeLeftContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  routeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningLight,
    gap: 4,
  },
  ratingBadgeText: {
    fontSize: 9,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.warning,
  },
  asientosDisponiblesText: {
    fontSize: 11,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  routeTitle: {
    fontSize: 16,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginTop: 6,
    marginBottom: 6,
  },
  routeSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
  },
  routeRightPill: {
    width: 50,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  routeRightPillActive: {
    backgroundColor: Colors.accent,
  },
  routeRightPillInactive: {
    backgroundColor: 'rgba(255, 118, 72, 0.12)',
  },
  routeRightPillText: {
    fontSize: 24,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 16,
  },
  infoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 12,
  },
  infoCardCoopName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  cityCode: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  cityName: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.medium,
    fontFamily: Typography.family,
    marginTop: 4,
  },
  routeMiddle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  routeTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  routeLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  dotDestination: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.secondary,
  },
  durationText: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.bold,
    fontFamily: Typography.family,
  },
  infoCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.bold,
    fontFamily: Typography.family,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.foreground,
    fontWeight: Typography.weights.bold,
    fontFamily: Typography.family,
  },
  priceValue: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: Typography.weights.heavy,
    fontFamily: Typography.family,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  ctaBtn: {
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    fontFamily: Typography.family,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingBottom: 24,
    maxHeight: '75%',
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  sheetHeaderContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 24,
  },
  sheetTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 18,
    color: Colors.foreground,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  filterSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontFamily: Typography.family,
    fontWeight: '700',
    fontSize: 12,
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  filterPillActive: {
    backgroundColor: Colors.accent,
  },
  filterPillInactive: {
    backgroundColor: Colors.white,
  },
  pillText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 13,
  },
  pillTextActive: {
    color: Colors.white,
  },
  pillTextInactive: {
    color: Colors.foreground,
  },
  sortOptionsContainer: {
    flexDirection: 'column',
    gap: 10,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: Radius.full,
  },
  sortButtonActive: {
    backgroundColor: Colors.accent,
  },
  sortButtonInactive: {
    backgroundColor: Colors.white,
  },
  sortButtonText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 14,
  },
  sortButtonTextActive: {
    color: Colors.white,
  },
  sortButtonTextInactive: {
    color: Colors.foreground,
  },
  applyContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  applyButton: {
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 16,
    color: Colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
});
