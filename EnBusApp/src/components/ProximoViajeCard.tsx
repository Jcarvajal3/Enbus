/**
 * ProximoViajeCard — "Tu próximo viaje" sobre el buscador de Inicio (APP-16):
 * cuándo sale, la ruta, los asientos y el acceso directo al pase de abordaje.
 *
 *   const { proximo } = useProximoViaje();
 *   {proximo && <ProximoViajeCard proximo={proximo} onVerPase={() => router.push(…)} />}
 *
 * El bloque informativo se lee como uno solo con el lector de pantalla; el
 * botón queda aparte.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QrCode } from 'phosphor-react-native';
import { Badge, Button, Card, Text } from '@/src/components/ui';
import { fechaVE, formatDuracion, formatHoraVE, sumarDiasVE } from '@/src/utils/ve.generated';
import type { ProximoViaje } from '@/src/types';
import { Spacing } from '@/src/theme';

const DIAS_CORTOS = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
const TRES_HORAS_MIN = 180;

/** "Hoy", "Mañana" o "vie. 04/10" (día de la salida en hora de Venezuela). */
function etiquetaDia(salida: string, ahora: Date): string {
  const dia = fechaVE(salida);
  const hoy = fechaVE(ahora);
  if (dia === hoy) return 'Hoy';
  if (dia === sumarDiasVE(hoy, 1)) return 'Mañana';
  const [y, m, d] = dia.split('-');
  const semana = DIAS_CORTOS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()];
  return `${semana} ${d}/${m}`;
}

/** "Asiento 14" · "Asientos 14 y 15" · "Asientos 9, 14 y 15" */
function etiquetaAsientos(asientos: string[]): string {
  if (asientos.length === 0) return '';
  if (asientos.length === 1) return `Asiento ${asientos[0]}`;
  return `Asientos ${asientos.slice(0, -1).join(', ')} y ${asientos[asientos.length - 1]}`;
}

const minutosHasta = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 60000);

/** Minutos hasta la salida, recalculados cada minuto. */
function useMinutosParaSalir(salida: string): number {
  const [minutos, setMinutos] = useState(() => minutosHasta(salida));
  useEffect(() => {
    setMinutos(minutosHasta(salida));
    const id = setInterval(() => setMinutos(minutosHasta(salida)), 60_000);
    return () => clearInterval(id);
  }, [salida]);
  return minutos;
}

export function ProximoViajeCard({
  proximo,
  onVerPase,
}: {
  proximo: ProximoViaje;
  onVerPase(): void;
}) {
  const minutos = useMinutosParaSalir(proximo.salida);

  const titulo = `${etiquetaDia(proximo.salida, new Date())} · ${formatHoraVE(proximo.salida)}`;
  const ruta =
    proximo.ciudadOrigen && proximo.ciudadDestino
      ? `${proximo.ciudadOrigen} → ${proximo.ciudadDestino}`
      : proximo.ciudadOrigen || proximo.ciudadDestino;
  const meta = [etiquetaAsientos(proximo.asientos), proximo.cooperativa].filter(Boolean).join(' · ');
  const aviso =
    minutos <= 0
      ? 'Está saliendo'
      : minutos < TRES_HORAS_MIN
        ? `Sale en ${formatDuracion(minutos)}`
        : null;

  const etiquetaAccesible = [
    'Tu próximo viaje',
    titulo.replace(' · ', ', '),
    ruta ? ruta.replace(' → ', ' a ') : '',
    meta.replace(' · ', ', '),
    aviso ?? '',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Card tone="raised" padding="lg" style={s.card}>
      <View accessible accessibilityLabel={etiquetaAccesible} style={s.info}>
        <Text variant="overline" color="muted" uppercase>
          Tu próximo viaje
        </Text>
        <Text variant="heading">{titulo}</Text>
        {ruta ? (
          <Text variant="bodyStrong" numberOfLines={2}>
            {ruta}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="secondary" color="muted" numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        {aviso ? (
          <View style={s.aviso}>
            <Badge tone="pending" size="md">
              {aviso}
            </Badge>
          </View>
        ) : null}
      </View>

      <Button variant="accent" icon={QrCode} fullWidth onPress={onVerPase}>
        Ver pase de abordaje
      </Button>
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    gap: Spacing.lg,
  },
  info: {
    gap: Spacing.xs,
  },
  aviso: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
});
