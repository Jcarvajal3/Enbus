/**
 * ProximoViajeCard — "Tu próximo viaje" sobre el buscador de Inicio: cuándo sale, la
 * ruta, los asientos y el acceso directo al pase de abordaje.
 *
 *   const { proximo } = useProximoViaje();
 *   {proximo && <ProximoViajeCard proximo={proximo} onVerPase={() => router.push(…)} />}
 *
 * Es de noche, con el sol asomando: lo más importante de la pantalla cuando hay un
 * viaje cerca, y se distingue del buscador sin competir con él (su botón es blanco; el
 * sol se reserva para "Buscar viaje"). El bloque informativo se lee como uno solo con
 * el lector de pantalla; el botón queda aparte.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowRight, QrCode } from 'phosphor-react-native';
import { Atmosfera, Button, Text } from '@/src/components/ui';
import { LogoCooperativa } from '@/src/components/LogoCooperativa';
import { capitalizarInicio, fechaVE, formatDiaVE, formatDuracion, formatHoraVE, sumarDiasVE } from '@/src/utils/formatters';
import type { ProximoViaje } from '@/src/types';
import { alpha, Colors, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

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
  const conRuta = !!proximo.ciudadOrigen && !!proximo.ciudadDestino;
  const ruta = conRuta
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
    <View style={s.tarjeta}>
      <Atmosfera variante="noche" style={StyleSheet.absoluteFill} />

      <View accessible accessibilityLabel={etiquetaAccesible} style={s.info}>
        <View style={s.cabecera}>
          <Text variant="label" color="inverseMuted">
            Tu próximo viaje
          </Text>
          {aviso ? (
            <View style={s.aviso}>
              <View style={s.avisoPunto} />
              <Text variant="caption" weight="semibold" color="foreground" compact numberOfLines={1}>
                {aviso}
              </Text>
            </View>
          ) : null}
        </View>

        <Text variant="title" size="2xl" tracking="tight" color="inverse" style={s.titulo}>
          {titulo}
        </Text>

        {conRuta ? (
          <View style={s.ruta}>
            <Text variant="subheading" weight="medium" color="inverse" numberOfLines={1} style={s.ciudad}>
              {proximo.ciudadOrigen}
            </Text>
            <ArrowRight size={Sizes.icon.sm} color={Colors.primary} weight="bold" />
            <Text variant="subheading" weight="medium" color="inverse" numberOfLines={1} style={s.ciudad}>
              {proximo.ciudadDestino}
            </Text>
          </View>
        ) : ruta ? (
          <Text variant="subheading" weight="medium" color="inverse" numberOfLines={2}>
            {ruta}
          </Text>
        ) : null}

        {meta ? (
          <View style={[s.meta, s.metaFila]}>
            {proximo.cooperativa ? (
              <LogoCooperativa
                nombre={proximo.cooperativa}
                logoUrl={proximo.cooperativaLogo}
                size="sm"
                decorativo
              />
            ) : null}
            <Text variant="secondary" color="inverseMuted" numberOfLines={2} style={s.metaTexto}>
              {meta}
            </Text>
          </View>
        ) : null}
      </View>

      <Button variant="secondary" size="md" icon={QrCode} fullWidth onPress={onVerPase} style={s.boton}>
        Ver pase de abordaje
      </Button>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: Spacing.xl,
    backgroundColor: Colors.night,
    gap: Spacing.lg,
    ...Shadows.raised,
  },
  info: {
    gap: Spacing.xs,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + Sizes.hairline,
    minHeight: Sizes.badge.sm,
    paddingHorizontal: Spacing.sm + Spacing.xs / 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  avisoPunto: {
    width: Sizes.dot,
    height: Sizes.dot,
    borderRadius: Radius.full,
    backgroundColor: alpha(Colors.night, 0.75),
  },
  titulo: {
    marginTop: Spacing.xs,
  },
  ruta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ciudad: {
    flexShrink: 1,
  },
  meta: {
    marginTop: Spacing.xs / 2,
  },
  metaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaTexto: {
    flexShrink: 1,
  },
  boton: {
    borderWidth: 0,
  },
});
