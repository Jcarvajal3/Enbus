import React, { useState, useEffect } from 'react';
import { View, Text } from '@/tw';
import { Platform, StyleSheet } from 'react-native';
import { LocationSelector } from './LocationSelector';
import { Localidad, normalizeCityForDb } from '../utils/venezuela';
import { supabase } from '../utils/supabase';
import {
  CalendarBlank,
  ArrowsLeftRight,
  ArrowRight,
  MapPin,
  Package,
  Bus,
} from 'phosphor-react-native';
import { CalendarModal } from './CalendarModal';
import { PressableScale } from './PressableScale';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Radius, Shadows, Gradients } from '@/src/theme';

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface SearchFormProps {
  mode?: 'boletos' | 'encomiendas';
  showModeToggle?: boolean;
  initialOrigen?: Localidad;
  initialDestino?: Localidad;
  onSubmit: (data: { origen: Localidad; destino: Localidad; fecha?: string; mode: string }) => void;
}

export function SearchForm({
  mode: initialMode = 'boletos',
  showModeToggle = false,
  initialOrigen,
  initialDestino,
  onSubmit,
}: SearchFormProps) {
  const [currentMode, setCurrentMode] = useState<'boletos' | 'encomiendas'>(initialMode);
  const [origen, setOrigen] = useState<Localidad | null>(initialOrigen || null);
  const [destino, setDestino] = useState<Localidad | null>(initialDestino || null);
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDates, setActiveDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);

  // Animated swap rotation
  const rotation = useSharedValue(0);
  const swapStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleSubmit = () => {
    if (!origen || !destino) return;
    onSubmit({
      mode: currentMode,
      origen,
      destino,
      ...(currentMode === 'boletos' ? { fecha: fecha.toISOString() } : {}),
    });
  };

  const swapLocations = () => {
    Haptics.selectionAsync();
    rotation.value = withTiming(rotation.value + 180, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
    const temp = origen;
    setOrigen(destino);
    setDestino(temp);
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const modeIndicatorWidth = useSharedValue(0);
  const modeTranslateX = useSharedValue(0);

  const onTrackLayout = (event: any) => {
    const width = event.nativeEvent.layout.width;
    setTrackWidth(width);
    const padding = 8;
    const usableWidth = width - padding;
    const tabWidth = usableWidth / 2;
    modeIndicatorWidth.value = tabWidth;
    modeTranslateX.value = (currentMode === 'boletos' ? 0 : 1) * tabWidth;
  };

  useEffect(() => {
    if (trackWidth > 0) {
      const padding = 8;
      const tabWidth = (trackWidth - padding) / 2;
      modeTranslateX.value = withTiming((currentMode === 'boletos' ? 0 : 1) * tabWidth, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [currentMode, trackWidth]);

  useEffect(() => {
    if (currentMode !== 'boletos' || !origen || !destino) {
      setActiveDates(null);
      return;
    }

    let isMounted = true;
    const fetchActiveDates = async () => {
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
          const uniqueDates = Array.from(new Set(dates));
          setActiveDates(uniqueDates);

          if (uniqueDates.length > 0) {
            const currentYear = fecha.getFullYear();
            const currentMonth = String(fecha.getMonth() + 1).padStart(2, '0');
            const currentDay = String(fecha.getDate()).padStart(2, '0');
            const currentKey = `${currentYear}-${currentMonth}-${currentDay}`;

            if (!uniqueDates.includes(currentKey)) {
              const firstDateStr = uniqueDates[0];
              const [y, m, d] = firstDateStr.split('-').map(Number);
              const newDate = new Date(y, m - 1, d);
              setFecha(newDate);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching active dates:', err);
      } finally {
        if (isMounted) {
          setLoadingDates(false);
        }
      }
    };

    fetchActiveDates();

    return () => {
      isMounted = false;
    };
  }, [currentMode, origen, destino]);

  const calendarEnabled = !!origen && !!destino && !loadingDates && !!activeDates && activeDates.length > 0;

  const getCalendarText = () => {
    if (!origen || !destino) return 'Selecciona origen y destino';
    if (loadingDates) return 'Cargando fechas disponibles...';
    if (activeDates && activeDates.length === 0) return 'No hay viajes disponibles';
    return formatShortDate(fecha);
  };

  const animatedModeIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: modeTranslateX.value }],
      width: modeIndicatorWidth.value,
    };
  });

  const isBoleto = currentMode === 'boletos';
  const canSubmit =
    !!origen &&
    !!destino &&
    (currentMode === 'encomiendas' || (!loadingDates && !!activeDates && activeDates.length > 0));

  return (
    <View style={s.card}>

      {/* ── Segmented pill control ── */}
      {showModeToggle && (
        <View style={s.segmentPad}>
          <View style={s.segmentTrack} onLayout={onTrackLayout}>
            {trackWidth > 0 && (
              <Animated.View style={[s.segmentIndicator, animatedModeIndicatorStyle]} />
            )}
            <PressableScale
              onPress={() => { Haptics.selectionAsync(); setCurrentMode('boletos'); }}
              style={s.segmentTab}
            >
              <Bus size={15} color={isBoleto ? Colors.foreground : Colors.mutedForeground} weight="fill" />
              <Text style={[s.segmentText, isBoleto && s.segmentTextActive]}>Viajar</Text>
            </PressableScale>
            <PressableScale
              onPress={() => { Haptics.selectionAsync(); setCurrentMode('encomiendas'); }}
              style={s.segmentTab}
            >
              <Package size={15} color={!isBoleto ? Colors.foreground : Colors.mutedForeground} weight="fill" />
              <Text style={[s.segmentText, !isBoleto && s.segmentTextActive]}>Enviar</Text>
            </PressableScale>
          </View>
        </View>
      )}

      {/* ── Location row ── */}
      <View style={s.locationRow}>
        {/* Origen dropdown */}
        <LocationSelector
          label="Origen"
          value={origen}
          onChange={setOrigen}
          customTrigger={(openModal) => (
            <PressableScale
              onPress={openModal}
              scaleValue={0.97}
              style={s.locationBtn}
            >
              <View style={s.locationIcon}>
                <MapPin size={15} color={Colors.primary} weight="fill" />
              </View>
              <View style={s.locationInfo}>
                <Text style={s.locationLabel}>Desde</Text>
                <Text style={s.locationValue} numberOfLines={1}>
                  {origen ? origen.ciudad : 'Origen'}
                </Text>
              </View>
            </PressableScale>
          )}
        />

        {/* Swap button */}
        <PressableScale
          onPress={swapLocations}
          scaleValue={0.80}
          duration={120}
          style={s.swapBtn}
        >
          <Animated.View style={swapStyle}>
            <ArrowsLeftRight size={16} color={Colors.mutedForeground} weight="bold" />
          </Animated.View>
        </PressableScale>

        {/* Destino dropdown */}
        <LocationSelector
          label="Destino"
          value={destino}
          onChange={setDestino}
          customTrigger={(openModal) => (
            <PressableScale
              onPress={openModal}
              scaleValue={0.97}
              style={s.locationBtn}
            >
              <View style={s.locationIcon}>
                <MapPin size={15} color={Colors.primary} weight="fill" />
              </View>
              <View style={s.locationInfo}>
                <Text style={s.locationLabel}>Hacia</Text>
                <Text style={s.locationValue} numberOfLines={1}>
                  {destino ? destino.ciudad : 'Destino'}
                </Text>
              </View>
            </PressableScale>
          )}
        />
      </View>

      {/* ── Date row (boletos only, no ida/vuelta toggle) ── */}
      {isBoleto && (
        <PressableScale
          onPress={() => {
            if (calendarEnabled) {
              setShowDatePicker(true);
            }
          }}
          disabled={!calendarEnabled}
          style={[s.dateRow, !calendarEnabled && s.dateRowDisabled]}
        >
          <CalendarBlank
            size={17}
            color={!calendarEnabled ? Colors.mutedForeground : Colors.primary}
            weight="bold"
          />
          <Text style={[s.dateText, !calendarEnabled && s.dateTextDisabled]}>
            {getCalendarText()}
          </Text>
          {calendarEnabled && activeDates && (
            <CalendarModal
              visible={showDatePicker}
              onClose={() => setShowDatePicker(false)}
              value={fecha}
              onChange={setFecha}
              minimumDate={new Date()}
              activeDates={activeDates}
            />
          )}
        </PressableScale>
      )}

      {/* ── CTA ── */}
      <PressableScale
        onPress={handleSubmit}
        disabled={!canSubmit}
        haptic
        hapticType="medium"
        scaleValue={0.97}
        style={[s.cta, !canSubmit && s.ctaDisabled]}
      >
        <LinearGradient
          colors={
            canSubmit ? [Colors.accent, Colors.accent] : ['rgba(74, 127, 248, 0.35)', 'rgba(74, 127, 248, 0.35)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.ctaGradient}
        >
          <Text style={[s.ctaText, !canSubmit && s.ctaTextDisabled]}>
            {isBoleto ? 'Buscar Boletos' : 'Registrar Envío'}
          </Text>
          <ArrowRight
            size={19}
            weight="bold"
            color={canSubmit ? Colors.white : 'rgba(255,255,255,0.4)'}
          />
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },

  // ── Segmented control ─────────────────────────────────────────────────────
  segmentPad: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 10,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    zIndex: 2,
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    left: 4,
    zIndex: 1,
  },
  segmentText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.mutedForeground,
    letterSpacing: 0.1,
  },
  segmentTextActive: {
    color: Colors.foreground,
    fontWeight: Typography.weights.bold,
  },

  // ── Location row ──────────────────────────────────────────────────────────
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 0,
    gap: 6,
  },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 0,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 9,
    minHeight: 62,
  },
  locationIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 10,
    fontFamily: Typography.family,
    fontWeight: '700',
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  swapBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },

  // ── Date row ─────────────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 0,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderWidth: 0,
    borderRadius: Radius.full,
    gap: 10,
  },
  dateRowDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.6,
  },
  dateText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: '600',
    color: Colors.foreground,
    flex: 1,
    textTransform: 'capitalize',
  },
  dateTextDisabled: {
    color: Colors.mutedForeground,
  },

  // ── CTA ──────────────────────────────────────────────────────────────────
  cta: {
    marginTop: 10,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  ctaDisabled: {
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: Radius.full,
    gap: 8,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  ctaTextDisabled: {
    color: 'rgba(255,255,255,0.5)',
  },
});
