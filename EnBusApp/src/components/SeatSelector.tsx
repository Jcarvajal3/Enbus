import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ArrowClockwise, Clock, WarningCircle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { BottomSheet, Button, Card, Monto, Text } from '@/src/components/ui';
import { generarAsientos } from '@/src/utils/seatLayout';
import { formatBs, formatMoney } from '@/src/utils/dinero';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import {
  formatCuentaAtras,
  mensajeAsientosTomados,
  ordenarAsientos,
  unirAsientos,
  type TasaCambiada,
} from '@/src/hooks/useCheckoutBoletos';
import { Colors, Layout, Motion, Radius, Sizes, Spacing, alpha } from '@/src/theme';

/** Mismo límite que `fn_reservar_asientos`. */
const MAX_ASIENTOS = 10;

interface SeatSelectorProps {
  asientosTotales: number;
  /** Asientos de otros pasajeros (los apartados por esta compra no van aquí) */
  asientosOcupados: string[];
  /** USD de referencia por asiento */
  precioUnitario: number;
  /** Aparta los asientos (`fn_reservar_asientos`); la pantalla maneja los errores */
  onConfirm: (asientos: string[]) => void | Promise<void>;
  /** Asientos ya apartados por esta compra (al volver desde el pago) */
  seleccionInicial?: string[];
  /** La reserva está en curso: botón "Apartando…" y mapa bloqueado */
  confirmando?: boolean;
  /**
   * Se están leyendo los asientos ocupados (`fn_asientos_ocupados`): el mapa
   * queda bloqueado y no se puede apartar hasta tenerlos (M-17).
   */
  cargandoOcupados?: boolean;
  /** No se pudieron leer los ocupados: mensaje + "Reintentar"; no se puede apartar. */
  errorOcupados?: string | null;
  onReintentarOcupados?: () => void;
  /**
   * El perfil del comprador aún se está leyendo: se pueden elegir asientos,
   * pero "Apartar" espera ("Cargando tus datos…") para saber si hay que pedir
   * la cédula y el teléfono antes (#24).
   */
  cargandoPerfil?: boolean;
}

const SEAT_SIZE = Sizes.control.md - 4;
const AISLE_WIDTH = Spacing.xl;

// ─── Seat ────────────────────────────────────────────────────────────────────

function SeatButton({
  seat,
  ocupado,
  seleccionado,
  bloqueado,
  onToggle,
}: {
  seat: string;
  ocupado: boolean;
  seleccionado: boolean;
  bloqueado: boolean;
  onToggle: (seat: string) => void;
}) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const handlePress = () => {
    if (ocupado || bloqueado) return;
    // Selecting pops; deselecting settles back without the overshoot.
    // Con "reducir movimiento" no hay rebote: el color ya dice que se eligió.
    if (!reduceMotion) {
      scale.value = seleccionado
        ? withSpring(1, Motion.spring.snappy)
        : withSequence(withSpring(1.14, Motion.spring.bouncy), withSpring(1, Motion.spring.snappy));
    }
    Haptics.selectionAsync();
    onToggle(seat);
  };

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const colors = seleccionado
    ? { bg: Colors.accent, border: Colors.accent, fg: Colors.white }
    : ocupado
      ? { bg: Colors.surface, border: Colors.border, fg: Colors.mutedForeground }
      : { bg: Colors.white, border: Colors.border, fg: Colors.foreground };

  return (
    <Animated.View style={[s.seatWrapper, animStyle]}>
      <PressableScale
        onPress={handlePress}
        disabled={ocupado || bloqueado}
        scaleValue={0.92}
        duration={Motion.duration.instant}
        style={[s.seat, { backgroundColor: colors.bg, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado || bloqueado, selected: seleccionado }}
        accessibilityLabel={`Asiento ${seat}${
          ocupado ? ', ocupado' : seleccionado ? ', seleccionado' : ', disponible'
        }`}
      >
        <Text
          variant="caption"
          size="xs"
          weight={seleccionado ? 'heavy' : 'bold'}
          color={colors.fg}
          compact
          style={ocupado ? s.seatOcupado : undefined}
        >
          {seat}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

// ─── Selector ────────────────────────────────────────────────────────────────

export function SeatSelector({
  asientosTotales,
  asientosOcupados,
  precioUnitario,
  onConfirm,
  seleccionInicial,
  confirmando = false,
  cargandoOcupados = false,
  errorOcupados = null,
  onReintentarOcupados,
  cargandoPerfil = false,
}: SeatSelectorProps) {
  const [seleccionados, setSeleccionados] = useState<string[]>(() =>
    (seleccionInicial ?? []).filter((a) => !asientosOcupados.includes(a))
  );
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  /** "El asiento 14 acaba de ser tomado. Elige otro." (M-14) */
  const [avisoTomados, setAvisoTomados] = useState<string | null>(null);
  const confirmandoRef = useRef(false);
  const filas = useMemo(() => generarAsientos(asientosTotales), [asientosTotales]);
  const { tasaRef } = useTasaBCV();

  /** Sin la lista de ocupados no se sabe qué está libre: no se elige ni se aparta. */
  const sinOcupados = cargandoOcupados || !!errorOcupados;
  const mapaBloqueado = confirmando || sinOcupados;

  const toggleSeat = useCallback(
    (seat: string) => {
      if (mapaBloqueado || asientosOcupados.includes(seat)) return;
      setAvisoTomados(null);
      if (seleccionados.includes(seat)) {
        setLimiteAlcanzado(false);
        setSeleccionados((prev) => prev.filter((s) => s !== seat));
        return;
      }
      if (seleccionados.length >= MAX_ASIENTOS) {
        setLimiteAlcanzado(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      setSeleccionados((prev) => (prev.includes(seat) ? prev : [...prev, seat]));
    },
    [asientosOcupados, mapaBloqueado, seleccionados]
  );

  // Otro pasajero tomó un asiento que habíamos elegido (lo dice el servidor o
  // la recarga de ocupados): se quita y se avisa, nunca en silencio.
  const seleccionadosRef = useRef(seleccionados);
  seleccionadosRef.current = seleccionados;
  useEffect(() => {
    const tomados = seleccionadosRef.current.filter((s) => asientosOcupados.includes(s));
    if (tomados.length === 0) return;
    setSeleccionados((prev) => prev.filter((s) => !asientosOcupados.includes(s)));
    setAvisoTomados(mensajeAsientosTomados(ordenarAsientos(tomados)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [asientosOcupados]);

  const total = seleccionados.length * precioUnitario;
  const ordenados = ordenarAsientos(seleccionados);
  const plural = ordenados.length > 1;
  const unitario = formatMoney({ usd: precioUnitario, tasa: tasaRef });

  const etiquetaBoton = confirmando
    ? 'Apartando…'
    : cargandoOcupados
      ? 'Revisando asientos libres…'
      : errorOcupados
        ? 'Reintenta para ver los asientos'
        : ordenados.length === 0
          ? 'Elige tus asientos'
          : cargandoPerfil
            ? 'Cargando tus datos…'
            : `Apartar asiento${plural ? 's' : ''} ${unirAsientos(ordenados)}`;

  return (
    <Card padding="md">
      {errorOcupados ? (
        <View style={s.errorOcupados} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <WarningCircle size={Sizes.icon.md} color={Colors.dangerText} weight="fill" />
          <View style={s.reservaBody}>
            <Text variant="label" color="dangerText">
              No pudimos ver qué asientos están ocupados.
            </Text>
            <Text variant="caption" color="foreground">
              {errorOcupados}
            </Text>
            {onReintentarOcupados ? (
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowClockwise}
                onPress={onReintentarOcupados}
                style={s.reintentar}
              >
                Reintentar
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}

      {avisoTomados ? (
        <View style={s.avisoTomados} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <WarningCircle size={Sizes.icon.md} color={Colors.warningText} weight="fill" />
          <Text variant="label" color="warningText" style={s.reservaBody}>
            {avisoTomados}
          </Text>
        </View>
      ) : null}

      <View style={s.legend}>
        <LegendItem color={Colors.white} bordered label="Libre" />
        <LegendItem color={Colors.accent} label="Tu asiento" />
        <LegendItem color={Colors.surface} bordered label="Ocupado" />
      </View>

      <View style={s.bus}>
        <Text variant="overline" color="muted" align="center" uppercase style={s.busFront}>
          Frente
        </Text>

        <ScrollView style={s.busScroll} showsVerticalScrollIndicator={false}>
          {filas.map((fila, rowIndex) => (
            <View key={`fila-${rowIndex}`} style={s.row}>
              {fila.map((seat, colIndex) =>
                seat === '' ? (
                  <View key={`pasillo-${rowIndex}-${colIndex}`} style={s.aisle} />
                ) : (
                  <SeatButton
                    key={seat}
                    seat={seat}
                    ocupado={asientosOcupados.includes(seat)}
                    seleccionado={seleccionados.includes(seat)}
                    bloqueado={mapaBloqueado}
                    onToggle={toggleSeat}
                  />
                )
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {seleccionados.length > 0 ? (
        <View style={s.summary}>
          <View style={s.summaryRow}>
            <Text variant="secondary" color="muted">
              {`Asiento${plural ? 's' : ''} `}
              <Text variant="bodyStrong" size="sm">
                {ordenados.join(', ')}
              </Text>
            </Text>
            <Text
              variant="secondary"
              color="muted"
              accessibilityLabel={`${unitario.accesible} cada asiento`}
            >
              {`× ${unitario.principal}`}
            </Text>
          </View>

          <View style={s.totalRow}>
            <Text variant="subheading" weight="heavy">
              Total
            </Text>
            <Monto usd={total} tasa={tasaRef} align="right" />
          </View>

          {limiteAlcanzado ? (
            <Text variant="caption" color="warningText">
              {`Puedes apartar hasta ${MAX_ASIENTOS} asientos por compra.`}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text variant="secondary" color="muted" align="center" style={s.hint}>
          {cargandoOcupados
            ? 'Revisando qué asientos siguen libres…'
            : 'Toca los asientos que quieras. Te los apartamos 30 minutos mientras registras tu pago.'}
        </Text>
      )}

      <Button
        variant="accent"
        fullWidth
        disabled={ordenados.length === 0 || mapaBloqueado || cargandoPerfil}
        onPress={() => {
          // `confirmando` llega en el siguiente render: la ref frena el doble toque.
          if (mapaBloqueado || cargandoPerfil || ordenados.length === 0 || confirmandoRef.current)
            return;
          confirmandoRef.current = true;
          void Promise.resolve(onConfirm(ordenados)).finally(() => {
            confirmandoRef.current = false;
          });
        }}
      >
        {etiquetaBoton}
      </Button>
    </Card>
  );
}

// ─── Reserva: estado y cuenta atrás (paso de pago) ───────────────────────────

/** Desde aquí el temporizador pasa a tono de advertencia. */
const AVISO_SEGUNDOS = 5 * 60;

/**
 * Encabezado del paso de pago: "Asientos 14 y 15 apartados · 29:41". Con 5
 * minutos o menos, en tono de advertencia ("Te quedan 4:59…"); a 0, la tarjeta
 * de reserva vencida con la salida para volver a elegir.
 */
export function ReservaEstado({
  asientos,
  segundos,
  onElegirDeNuevo,
}: {
  asientos: string[];
  /** Segundos restantes según el servidor; null = sin vencimiento */
  segundos: number | null;
  onElegirDeNuevo: () => void;
}) {
  const plural = asientos.length > 1;
  const titulo = `Asiento${plural ? 's' : ''} ${unirAsientos(asientos)} apartado${plural ? 's' : ''}`;

  if (segundos === 0) {
    return (
      <Card padding="md" style={s.reservaCard}>
        <View style={s.reservaRow} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <WarningCircle size={Sizes.icon.lg} color={Colors.dangerText} weight="fill" />
          <View style={s.reservaBody}>
            <Text variant="bodyStrong">Tu reserva venció</Text>
            <Text variant="secondary" color="muted">
              Se acabó el tiempo y liberamos tus asientos. Si ya pagaste, no pagues de nuevo:
              vuelve a elegir asientos y registra la misma referencia.
            </Text>
          </View>
        </View>
        <Button variant="accent" fullWidth onPress={onElegirDeNuevo} style={s.reservaAction}>
          Volver a elegir asientos
        </Button>
      </Card>
    );
  }

  const urgente = segundos !== null && segundos <= AVISO_SEGUNDOS;
  const tiempo = segundos === null ? null : formatCuentaAtras(segundos);
  const minutos = segundos === null ? 0 : Math.ceil(segundos / 60);

  return (
    <View
      style={[s.reserva, urgente ? s.reservaUrgente : s.reservaNormal]}
      accessible
      accessibilityLabel={
        tiempo
          ? `${titulo}. Te quedan unos ${minutos} minutos para completar tu compra.`
          : titulo
      }
    >
      <Clock
        size={Sizes.icon.md}
        color={urgente ? Colors.warningText : Colors.mutedForeground}
        weight="fill"
      />
      <View style={s.reservaBody}>
        <Text variant="label" color={urgente ? 'warningText' : 'foreground'}>
          {tiempo && !urgente ? `${titulo} · ${tiempo}` : titulo}
        </Text>
        {urgente && tiempo ? (
          <Text variant="caption" color="warningText">
            {`Te quedan ${tiempo} para completar tu compra`}
          </Text>
        ) : (
          <Text variant="caption" color="muted">
            Completa tu compra antes de que se acabe el tiempo.
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * `EB_TASA_CAMBIO`: la tasa BCV cambió entre la cotización y el registro.
 * "Registrar con el nuevo total" reintenta con lo que el usuario declaró;
 * "Revisar" vuelve al formulario, que ya muestra el total nuevo.
 */
export function TasaCambiadaSheet({
  cambio,
  enviando,
  onConfirmar,
  onRevisar,
}: {
  cambio: TasaCambiada | null;
  enviando: boolean;
  onConfirmar: () => void;
  onRevisar: () => void;
}) {
  const antes = cambio?.anteriorBs != null ? ` (antes ${formatBs(cambio.anteriorBs)})` : '';
  return (
    <BottomSheet
      visible={cambio !== null}
      onClose={() => {
        if (!enviando) onRevisar();
      }}
      title="La tasa BCV cambió"
      footer={
        <View style={s.sheetButtons}>
          <Button variant="accent" fullWidth disabled={enviando} onPress={onConfirmar}>
            {enviando ? 'Registrando tu pago…' : 'Registrar con el nuevo total'}
          </Button>
          <Button variant="ghost" fullWidth disabled={enviando} onPress={onRevisar}>
            Revisar
          </Button>
        </View>
      }
    >
      <View style={s.sheetBody}>
        <Text variant="body">
          {cambio
            ? `La tasa BCV se actualizó. El total ahora es ${formatBs(cambio.nuevoBs)}${antes}. Si ya transferiste el monto anterior, regístralo igual: la cooperativa verá la diferencia.`
            : ''}
        </Text>
      </View>
    </BottomSheet>
  );
}

function LegendItem({
  color,
  label,
  bordered,
}: {
  color: string;
  label: string;
  bordered?: boolean;
}) {
  return (
    <View style={s.legendItem}>
      <View
        style={[
          s.legendDot,
          {
            backgroundColor: color,
            borderWidth: bordered ? Sizes.hairline : 0,
            borderColor: Colors.border,
          },
        ]}
      />
      <Text variant="caption" color="muted" compact>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
  },
  legendDot: {
    width: Spacing.lg - 2,
    height: Spacing.lg - 2,
    borderRadius: Radius.xs,
  },
  bus: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  busFront: {
    marginBottom: Spacing.lg,
  },
  busScroll: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seatWrapper: {
    marginHorizontal: Spacing.xs - 1,
  },
  seat: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Sizes.hairline,
  },
  seatOcupado: {
    textDecorationLine: 'line-through',
  },
  aisle: {
    width: AISLE_WIDTH,
    height: SEAT_SIZE,
  },
  summary: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  hint: {
    marginBottom: Spacing.xl,
  },
  errorOcupados: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.destructiveSoft,
    borderWidth: Sizes.hairline,
    borderColor: Colors.destructiveBorder,
    marginBottom: Spacing.lg,
  },
  reintentar: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  avisoTomados: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warningLight,
    borderWidth: Sizes.hairline,
    borderColor: alpha(Colors.warning, 0.25),
    marginBottom: Spacing.lg,
  },

  // ── Reserva
  reserva: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: Sizes.hairline,
    marginBottom: Spacing.lg,
  },
  reservaNormal: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  reservaUrgente: {
    backgroundColor: Colors.warningLight,
    borderColor: alpha(Colors.warning, 0.25),
  },
  reservaCard: {
    marginBottom: Spacing.lg,
  },
  reservaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  reservaBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  reservaAction: {
    marginTop: Spacing.lg,
  },
  sheetBody: {
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.xl,
  },
  sheetButtons: {
    gap: Spacing.sm,
  },
});
