/**
 * ReservaTimer — la cuenta atrás de una reserva, con un solo aspecto (AU-16).
 *
 * Aviso ámbar con reloj, lo apartado ("Asiento 6 apartado") y el tiempo que
 * queda en una píldora `warningText` ("29:55"). Lo usan el paso "¿Quién
 * viaja?" y el de pago de la compra, el detalle de un boleto sin pagar y la
 * hoja "Registrar pago".
 *
 *   <ReservaTimer segundos={s} titulo="Asiento 6 apartado" />
 *   {s === 0 && <ReservaVencida onElegirDeNuevo={…} />}
 *
 * Con `segundos === null` (sin vencimiento conocido) no hay píldora.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock, WarningCircle } from 'phosphor-react-native';
import { Button, Text } from '@/src/components/ui';
import { formatCuentaAtras } from '@/src/hooks/useCheckoutBoletos';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

export function ReservaTimer({
  segundos,
  titulo,
  detalle,
}: {
  /** Segundos que quedan según el servidor; `null` = sin vencimiento conocido */
  segundos: number | null;
  /** "Asiento 6 apartado", "Asientos 6 y 7 apartados" */
  titulo: string;
  /** Una línea opcional: qué hacer antes de que venza */
  detalle?: string;
}) {
  const tiempo = segundos === null ? null : formatCuentaAtras(segundos);
  const minutos = segundos === null ? 0 : Math.ceil(segundos / 60);

  return (
    <View
      style={s.caja}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={
        tiempo
          ? `${titulo}. Quedan unos ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.${detalle ? ` ${detalle}` : ''}`
          : `${titulo}.${detalle ? ` ${detalle}` : ''}`
      }
    >
      <Clock size={Sizes.icon.lg} color={Colors.warningText} weight="fill" />
      <View style={s.cuerpo}>
        <Text variant="label">{titulo}</Text>
        {detalle ? (
          <Text variant="caption" color="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      {tiempo ? (
        <View style={s.pildora}>
          <Text variant="label" weight="bold" color="inverse" compact style={s.cifras}>
            {tiempo}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * La reserva venció en pantalla: los asientos se liberan. Con
 * `onElegirDeNuevo`, la salida para volver al mapa de asientos.
 */
export function ReservaVencida({
  texto,
  onElegirDeNuevo,
}: {
  texto: string;
  onElegirDeNuevo?: () => void;
}) {
  return (
    <View style={[s.caja, s.vencida]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <WarningCircle size={Sizes.icon.lg} color={Colors.dangerText} weight="fill" />
      <View style={s.cuerpo}>
        <Text variant="label">Tu reserva venció</Text>
        <Text variant="caption" color="muted">
          {texto}
        </Text>
        {onElegirDeNuevo ? (
          <Button variant="outline" size="sm" onPress={onElegirDeNuevo} style={s.accion}>
            Elegir asientos
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warningLight,
  },
  vencida: {
    alignItems: 'flex-start',
    backgroundColor: Colors.destructiveLight,
  },
  cuerpo: {
    flex: 1,
    gap: Spacing.xs,
  },
  // Blanco sobre el naranja oscuro: ≥ 4,5:1 (el ámbar vivo no llega).
  pildora: {
    minWidth: Sizes.iconBox.xl,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningText,
  },
  cifras: {
    fontVariant: ['tabular-nums'],
  },
  accion: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
});
