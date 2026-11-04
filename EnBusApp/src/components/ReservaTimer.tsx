/**
 * ReservaTimer — la cuenta atrás de una reserva, con un solo aspecto.
 *
 * Tarjeta ámbar con lo apartado ("Asiento 6 apartado") y el tiempo que queda en
 * grande: es lo urgente de la pantalla y tiene que notarse. Lo usan el paso "¿Quién
 * viaja?" y el de pago de la compra, el detalle de un boleto sin pagar y la hoja
 * "Registrar pago".
 *
 *   <ReservaTimer segundos={s} titulo="Asiento 6 apartado" />
 *   {s === 0 && <ReservaVencida onElegirDeNuevo={…} />}
 *
 * Con `segundos === null` (sin vencimiento conocido) no hay cifra.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Hourglass } from 'phosphor-react-native';
import { Aviso, Button, Text } from '@/src/components/ui';
import { formatCuentaAtras } from '@/src/hooks/useCheckoutBoletos';
import { Colors, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

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
      <View style={s.icono}>
        <Hourglass size={Sizes.icon.md} color={Colors.warning} weight="fill" />
      </View>
      <View style={s.cuerpo}>
        <Text variant="bodyStrong">{titulo}</Text>
        {detalle ? (
          <Text variant="caption" color="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      {tiempo ? (
        <Text variant="heading" weight="bold" color="warningText" compact tabular>
          {tiempo}
        </Text>
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
    <Aviso
      tono="danger"
      titulo="Tu reserva venció"
      texto={texto}
      alerta
      extra={
        onElegirDeNuevo ? (
          <Button variant="outline" size="sm" onPress={onElegirDeNuevo} style={s.accion}>
            Elegir asientos
          </Button>
        ) : null
      }
    />
  );
}

const s = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    backgroundColor: Colors.warningLight,
  },
  icono: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  cuerpo: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  accion: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
});
