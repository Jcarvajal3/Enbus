/**
 * cooperativas/[id] — detalle de una cooperativa aliada: su logo, su nombre y su
 * calificación; sus rutas activas (origen → destino, pasaje desde y duración), que
 * abren la búsqueda de boletos con la ruta ya puesta y solo sus salidas; y sus
 * sucursales (ciudad, dirección, teléfono y horario).
 *
 * Solo cooperativas ACTIVAS: una suspendida o dada de baja se ve como "no
 * disponible". ← vuelve al listado de cooperativas.
 */
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bus, CaretDown, Clock, MapPin, Phone, Storefront } from 'phosphor-react-native';
import { LogoCooperativa } from '@/src/components/LogoCooperativa';
import { CalificacionCooperativa, textoCalificacion } from '@/src/components/CalificacionCooperativa';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  EntityCard,
  ErrorState,
  IconTile,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  TextLink,
  scrollContent,
} from '@/src/components/ui';
import { useVolver } from '@/src/hooks/useVolver';
import { ciudadesDe, precioDesde, useCooperativa } from '@/src/hooks/useCooperativas';
import { formatCity, formatDuracion } from '@/src/utils/formatters';
import { formatUsd } from '@/src/utils/dinero';
import { formatTelefono } from '@/src/utils/validation';
import type { RutaCooperativa, SucursalCooperativa } from '@/src/types';
import { Colors, Sizes, Spacing } from '@/src/theme';

/** Rutas a la vista antes de "Ver todas". */
const RUTAS_VISIBLES = 6;

const etiquetaCantidad = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function CooperativaDetalleScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const volver = useVolver('/cooperativas');
  const { data: coop, loading, error, noEncontrada, recargar } = useCooperativa(id);
  const [todasLasRutas, setTodasLasRutas] = useState(false);

  if (loading && !coop) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Cooperativa" onBack={volver} />
        <ScreenSkeleton variante="detalle" />
      </Screen>
    );
  }

  if (error && !coop) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Cooperativa" onBack={volver} />
        <ErrorState title="No pudimos cargar la cooperativa" description={error} onRetry={recargar} />
      </Screen>
    );
  }

  if (noEncontrada || !coop) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Cooperativa" onBack={volver} />
        <EmptyState
          icon={Bus}
          title="Esta cooperativa no está disponible"
          description="Puede que ya no venda en EnBus. Mira las demás cooperativas aliadas."
          action={{
            children: 'Ver cooperativas',
            icon: Bus,
            onPress: () => router.replace('/cooperativas'),
          }}
        />
      </Screen>
    );
  }

  const ciudades = ciudadesDe(coop.rutas);
  const desde = precioDesde(coop.rutas);
  const rutas = todasLasRutas ? coop.rutas : coop.rutas.slice(0, RUTAS_VISIBLES);
  const ocultas = coop.rutas.length - rutas.length;
  const resumen = [
    coop.rutas.length > 0 ? etiquetaCantidad(coop.rutas.length, 'ruta', 'rutas') : '',
    ciudades.length > 0 ? etiquetaCantidad(ciudades.length, 'ciudad', 'ciudades') : '',
    coop.sucursales.length > 0 ? etiquetaCantidad(coop.sucursales.length, 'sucursal', 'sucursales') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const buscarRuta = (ruta: RutaCooperativa) =>
    router.push({
      pathname: '/boletos/buscar',
      params: {
        origen: formatCity(ruta.ciudad_origen),
        destino: formatCity(ruta.ciudad_destino),
        cooperativaId: coop.id,
      },
    });

  return (
    <Screen>
      <ScreenHeader variant="compact" eyebrow="Cooperativa aliada" title={coop.nombre} onBack={volver} />

      <ScrollView contentContainerStyle={scrollContent()} showsVerticalScrollIndicator={false}>
        {/* ── Portada: logo, nombre y calificación ─────────────────────────── */}
        <StaggerItem index={0}>
          <Card style={s.portada}>
            <View
              accessible
              accessibilityLabel={[
                coop.nombre,
                `Calificación ${textoCalificacion(coop.calificacion_promedio, coop.total_calificaciones)}`,
                resumen,
                desde !== null ? `Pasaje desde ${formatUsd(desde)}` : '',
              ]
                .filter(Boolean)
                .join('. ')}
              style={s.portadaContenido}
            >
              <LogoCooperativa nombre={coop.nombre} logoUrl={coop.logo_url} size="xl" decorativo />
              <Text variant="heading" align="center" accessibilityRole="header">
                {coop.nombre}
              </Text>
              <CalificacionCooperativa valor={coop.calificacion_promedio} total={coop.total_calificaciones} />
              {resumen ? (
                <Text variant="secondary" color="muted" align="center">
                  {resumen}
                </Text>
              ) : null}
              {desde !== null ? (
                <Text variant="secondary" color="muted" align="center">
                  {'Pasaje desde '}
                  <Text variant="secondary" weight="semibold">
                    {formatUsd(desde)}
                  </Text>
                </Text>
              ) : null}
            </View>
          </Card>
        </StaggerItem>

        {/* ── Rutas ────────────────────────────────────────────────────────── */}
        <StaggerItem index={1} style={s.seccion}>
          <SectionLabel>Rutas</SectionLabel>
          {coop.rutas.length === 0 ? (
            <Card>
              <Text variant="body" color="muted">
                Esta cooperativa aún no publica sus rutas.
              </Text>
            </Card>
          ) : (
            <>
              {rutas.map((ruta) => (
                <FilaRuta key={ruta.id} ruta={ruta} onPress={() => buscarRuta(ruta)} />
              ))}
              {ocultas > 0 ? (
                <Button variant="ghost" icon={CaretDown} fullWidth onPress={() => setTodasLasRutas(true)}>
                  {`Ver las ${coop.rutas.length} rutas`}
                </Button>
              ) : null}
            </>
          )}
        </StaggerItem>

        {/* ── Sucursales ───────────────────────────────────────────────────── */}
        <StaggerItem index={2} style={s.seccion}>
          <SectionLabel>Sucursales</SectionLabel>
          <Card>
            {coop.sucursales.length === 0 ? (
              <Text variant="body" color="muted">
                Esta cooperativa aún no publica sus sucursales.
              </Text>
            ) : (
              coop.sucursales.map((sucursal, i) => (
                <View key={sucursal.id}>
                  {i > 0 ? <Divider /> : null}
                  <FilaSucursal sucursal={sucursal} />
                </View>
              ))
            )}
          </Card>
        </StaggerItem>
      </ScrollView>
    </Screen>
  );
}

// ─── Ruta ────────────────────────────────────────────────────────────────────

/**
 * "Caracas → Mérida", la duración y el pasaje. Con precio abre la búsqueda de
 * boletos de esa ruta; sin precio, la ruta existe pero aún no vende boletos aquí.
 */
function FilaRuta({ ruta, onPress }: { ruta: RutaCooperativa; onPress: () => void }) {
  const origen = formatCity(ruta.ciudad_origen);
  const destino = formatCity(ruta.ciudad_destino);
  const minutos = Number(ruta.duracion_estimada_min) || 0;
  const precio = Number(ruta.precio_pasaje) || 0;
  const vende = precio > 0;
  const duracion = minutos > 0 ? `Unas ${formatDuracion(minutos)} de viaje` : 'Duración por confirmar';

  return (
    <EntityCard
      title={`${origen} → ${destino}`}
      subtitle={duracion}
      badge={
        <Text variant="caption" weight="medium" color={vende ? 'link' : 'muted'} compact>
          {vende ? 'Ver salidas' : 'Sin boletos en línea'}
        </Text>
      }
      meta={vende ? `Desde ${formatUsd(precio)}` : undefined}
      onPress={vende ? onPress : undefined}
      chevron={vende}
      accessibilityLabel={[
        `${origen} a ${destino}`,
        duracion,
        vende ? `Pasaje desde ${formatUsd(precio)}. Toca para ver las salidas` : 'Sin boletos en línea',
      ].join('. ')}
    />
  );
}

// ─── Sucursal ────────────────────────────────────────────────────────────────

function FilaSucursal({ sucursal }: { sucursal: SucursalCooperativa }) {
  const ciudad = formatCity(sucursal.ciudad);
  const estado = formatCity(sucursal.estado_geografico);
  const lugar = estado !== '—' && estado !== ciudad ? `${ciudad}, ${estado}` : ciudad;
  const telefono = sucursal.telefono?.trim() || '';
  // Un fijo (0212…) no pasa la validación de móvil: se muestra tal cual.
  const formateado = telefono ? formatTelefono(telefono) : '';
  const telefonoLegible = formateado && formateado !== '—' ? formateado : telefono;
  const marcable = telefono.replace(/[^\d+]/g, '');

  return (
    <View style={s.sucursal}>
      <View style={s.sucursalCabecera}>
        <IconTile tone="sky" icon={Storefront} size="sm" />
        <View style={s.sucursalTitulo}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {sucursal.nombre}
          </Text>
          <Text variant="secondary" color="muted" numberOfLines={1}>
            {lugar}
          </Text>
        </View>
      </View>

      {sucursal.direccion ? (
        <Dato icono={MapPin} texto={sucursal.direccion} etiqueta="Dirección" />
      ) : null}
      {sucursal.horario ? <Dato icono={Clock} texto={sucursal.horario} etiqueta="Horario" /> : null}
      {telefonoLegible ? (
        <View style={s.dato}>
          <Phone size={Sizes.icon.sm} color={Colors.mutedForeground} weight="regular" />
          {marcable ? (
            <TextLink
              onPress={() => void Linking.openURL(`tel:${marcable}`).catch(() => {})}
              accessibilityLabel={`Llamar a ${sucursal.nombre}, ${telefonoLegible}`}
            >
              {telefonoLegible}
            </TextLink>
          ) : (
            <Text variant="secondary">{telefonoLegible}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Dato({
  icono: Icono,
  texto,
  etiqueta,
}: {
  icono: typeof MapPin;
  texto: string;
  etiqueta: string;
}) {
  return (
    <View style={s.dato} accessible accessibilityLabel={`${etiqueta}: ${texto}`}>
      <Icono size={Sizes.icon.sm} color={Colors.mutedForeground} weight="regular" />
      <Text variant="secondary" style={s.datoTexto}>
        {texto}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  portada: {
    alignItems: 'center',
  },
  portadaContenido: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  seccion: {
    marginTop: Spacing['2xl'],
  },
  sucursal: {
    gap: Spacing.sm,
  },
  sucursalCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sucursalTitulo: {
    flex: 1,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  datoTexto: {
    flex: 1,
  },
});
