/**
 * ProximoViajeCard — "Tu próximo viaje" sobre el buscador de Inicio (APP-16):
 * cuándo sale, la ruta, los asientos y el acceso directo al pase de abordaje.
 *
 *   const { proximo } = useProximoViaje();
 *   {proximo && <ProximoViajeCard proximo={proximo} onVerPase={() => router.push(…)} />}
 *
 * El bloque informativo se lee como uno solo con el lector de pantalla; el
 * botón queda aparte. El botón es `outline`: en Inicio la acción principal es
 * "Buscar viaje" (un solo amarillo por pantalla).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QrCode } from 'phosphor-react-native';
import { Badge, Button, Card, SectionLabel, Text } from '@/src/components/ui';
import { capitalizarInicio, fechaVE, formatDiaVE, formatDuracion, formatHoraVE, sumarDiasVE } from '@/src/utils/formatters';
import type { ProximoViaje } from '@/src/types';
import { Spacing } from '@/src/theme';

const TRES_HORAS_MIN = 180;

/** "Hoy", "Mañana" o "Vie. 4 oct." (día de la salida en hora de Venezuela). */
function etiquetaDia(salida: string, ahora: Date): string {
  const dia = fechaVE(salida);
  const hoy = fechaVE(ahora);
  if (dia === hoy) return 'Hoy';
  if (dia === sumarDiasVE(hoy, 1)) return 'Mañana';
  return capitalizarInicio(formatDiaVE(salida, ahora));
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
    <View>
      <SectionLabel>Tu próximo viaje</SectionLabel>
      <Card tone="sunken" padding="md" style={s.card}>
        <View accessible accessibilityLabel={etiquetaAccesible} style={s.info}>
          <View style={s.cabecera}>
            <Text variant="heading" style={s.titulo}>
              {titulo}
            </Text>
            {aviso ? <Badge tone="pending">{aviso}</Badge> : null}
          </View>
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
        </View>

        <Button variant="outline" size="md" icon={QrCode} fullWidth onPress={onVerPase}>
          Ver pase de abordaje
        </Button>
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    gap: Spacing.lg,
  },
  info: {
    gap: Spacing.xs,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  titulo: {
    flexShrink: 1,
  },
});
