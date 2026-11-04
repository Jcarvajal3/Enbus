/**
 * RouteSummary — el bloque ORIGEN ──●── DESTINO.
 *
 * Las ciudades son lo que se lee: grandes, alineadas a cada extremo, con la hora
 * debajo. Entre ellas, el camino: un punto de salida, una línea y un pin de llegada,
 * con la duración encima de la línea en una pastilla.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin } from 'phosphor-react-native';
import { Text } from './Text';
import { formatCity } from '@/src/utils/formatters';
import { alpha, Colors, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export interface RouteSummaryProps {
  origen?: string | null;
  destino?: string | null;
  /** e.g. "9 h 45 min" — shown over the connector when present */
  duration?: string;
  /** Hora de salida ya formateada ("8:30 p. m."), bajo el origen */
  horaSalida?: string;
  /** Hora de llegada ya formateada ("6:15 a. m. (+1)"), bajo el destino */
  horaLlegada?: string;
}

export function RouteSummary({
  origen,
  destino,
  duration,
  horaSalida,
  horaLlegada,
}: RouteSummaryProps) {
  const etiqueta = [
    `Ruta de ${formatCity(origen)} a ${formatCity(destino)}`,
    horaSalida ? `sale ${horaSalida}` : '',
    horaLlegada ? `llega ${horaLlegada.replace('(+1)', 'del día siguiente')}` : '',
    duration ? `duración ${duration}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={s.columna} accessible accessibilityLabel={etiqueta}>
      <View style={s.camino}>
        <View style={s.puntoSalida} />
        <View style={s.linea} />
        {duration ? (
          <>
            <View style={s.duracion}>
              <Text variant="caption" weight="medium" color="muted" compact numberOfLines={1}>
                {duration}
              </Text>
            </View>
            <View style={s.linea} />
          </>
        ) : null}
        <MapPin size={Sizes.icon.md} color={Colors.foreground} weight="fill" />
      </View>

      <View style={s.extremos}>
        <Extremo ciudad={origen} hora={horaSalida} />
        <Extremo ciudad={destino} hora={horaLlegada} derecha />
      </View>
    </View>
  );
}

function Extremo({
  ciudad,
  hora,
  derecha,
}: {
  ciudad?: string | null;
  hora?: string;
  derecha?: boolean;
}) {
  const align = derecha ? 'right' : 'left';
  return (
    <View style={[s.extremo, derecha && s.extremoDerecha]}>
      <Text variant="heading" size="xl" align={align} numberOfLines={2}>
        {formatCity(ciudad)}
      </Text>
      {hora ? (
        <Text variant="secondary" weight="medium" color="muted" align={align} tabular style={s.hora}>
          {hora}
        </Text>
      ) : null}
    </View>
  );
}

const PUNTO = Spacing.md;

const s = StyleSheet.create({
  columna: {
    gap: Spacing.md,
  },
  camino: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  puntoSalida: {
    width: PUNTO,
    height: PUNTO,
    borderRadius: Radius.full,
    borderWidth: Sizes.borderSelected + Sizes.hairline,
    borderColor: Colors.foreground,
    backgroundColor: Colors.background,
  },
  linea: {
    flex: 1,
    height: Sizes.borderSelected,
    borderRadius: Radius.full,
    backgroundColor: alpha(Colors.foreground, 0.14),
  },
  // Blanca: se lee igual sobre una tarjeta que sobre la cabecera del pase.
  duracion: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    ...Shadows.subtle,
  },
  extremos: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  extremo: {
    flex: 1,
  },
  extremoDerecha: {
    alignItems: 'flex-end',
  },
  hora: {
    marginTop: Spacing.xs / 2,
  },
});
