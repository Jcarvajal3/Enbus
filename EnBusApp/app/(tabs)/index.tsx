/**
 * Inicio — el amanecer de fondo, tu próximo viaje si lo hay, la pregunta y el
 * buscador como protagonista, y "Tu actividad" solo con algo en curso.
 */
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRight, Package, Ticket, type IconProps } from 'phosphor-react-native';
import { useActivity } from '@/src/contexts/ActivityContext';
import { useProximoViaje } from '@/src/hooks/useProximoViaje';
import { usePerfil } from '@/src/hooks/usePerfil';
import { SearchForm } from '@/src/components/SearchForm';
import { StaggerItem } from '@/src/components/StaggerItem';
import { PressableScale } from '@/src/components/PressableScale';
import { HeaderActions } from '@/src/components/HeaderActions';
import { BrandMark } from '@/src/components/BrandMark';
import { ProximoViajeCard } from '@/src/components/ProximoViajeCard';
import {
  Atmosfera,
  Card,
  IconTile,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  type IconTileTone,
} from '@/src/components/ui';
import { nombreValido } from '@/src/utils/validation';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora del teléfono. */
function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Alto de la portada: llega hasta la mitad del buscador, que flota sobre ella. */
const ALTO_PORTADA = 560;

export default function HomeScreen() {
  const router = useRouter();
  const { boletosActivos, encomiendasActivas } = useActivity();
  const { proximo } = useProximoViaje();
  const { perfil } = usePerfil();

  // Solo el nombre real: nunca el prefijo del correo ni "Usuario EnBus".
  const nombre = nombreValido(perfil?.nombre_completo)
    ? (perfil?.nombre_completo ?? '').trim().split(/\s+/)[0]
    : null;

  const hayActividad = boletosActivos > 0 || encomiendasActivas > 0;

  return (
    <Screen atmosfera={null}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.transparent} translucent />
      <Atmosfera variante="amanecer" style={s.portada} />

      {/* El contador de no leídas sale de ActivityContext (un solo canal). */}
      <ScreenHeader title={<BrandMark conNombre />} right={<HeaderActions />} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tu próximo viaje ───────────────────────────────────────────── */}
        {proximo ? (
          <View style={s.seccion}>
            <ProximoViajeCard
              proximo={proximo}
              onVerPase={() =>
                router.push({
                  pathname: '/boletos/[id]',
                  params: { id: proximo.codigo || proximo.boletoId },
                })
              }
            />
          </View>
        ) : null}

        {/* ── Saludo + buscador ───────────────────────────────────────────── */}
        <StaggerItem index={0} style={s.saludo}>
          <Text variant="body" weight="medium" color="foreground">
            {saludo()}
          </Text>
          <Text variant="title" accessibilityRole="header" style={s.pregunta}>
            {nombre ? `¿A dónde vamos, ${nombre}?` : '¿A dónde vamos hoy?'}
          </Text>
        </StaggerItem>

        <StaggerItem index={1}>
          <Card style={s.buscador}>
            <SearchForm
              showModeToggle
              onSubmit={(data) => {
                if (data.mode === 'boletos') {
                  router.push({
                    pathname: '/boletos/buscar',
                    params: {
                      origen: data.origen.ciudad,
                      destino: data.destino.ciudad,
                      fecha: data.fecha ?? '',
                    },
                  });
                } else {
                  router.push({
                    pathname: '/encomiendas/nueva',
                    params: {
                      origen_ciudad: data.origen.ciudad,
                      origen_estado: data.origen.estado,
                      destino_ciudad: data.destino.ciudad,
                      destino_estado: data.destino.estado,
                    },
                  });
                }
              }}
            />
          </Card>
        </StaggerItem>

        {/* ── Actividad en curso: solo lo que tiene algo ──────────────────── */}
        {hayActividad ? (
          <StaggerItem index={2} style={s.actividad}>
            <SectionLabel>Tu actividad</SectionLabel>
            <View style={s.mosaicos}>
              {boletosActivos > 0 ? (
                <Mosaico
                  icono={Ticket}
                  tono="sky"
                  cantidad={boletosActivos}
                  etiqueta={boletosActivos === 1 ? 'Boleto activo' : 'Boletos activos'}
                  onPress={() => router.push('/(tabs)/boletos')}
                />
              ) : null}
              {encomiendasActivas > 0 ? (
                <Mosaico
                  icono={Package}
                  tono="coral"
                  cantidad={encomiendasActivas}
                  etiqueta={encomiendasActivas === 1 ? 'Encomienda activa' : 'Encomiendas activas'}
                  onPress={() => router.push('/(tabs)/encomiendas')}
                />
              ) : null}
            </View>
          </StaggerItem>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ─── Mosaico de actividad ────────────────────────────────────────────────────

/** Acceso a una lista con algo en curso: la cifra es lo que se lee primero. */
function Mosaico({
  icono,
  tono,
  cantidad,
  etiqueta,
  onPress,
}: {
  icono: React.ComponentType<IconProps>;
  tono: IconTileTone;
  cantidad: number;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.mosaico}
      accessibilityRole="button"
      accessibilityLabel={`${cantidad} ${etiqueta.toLowerCase()}`}
    >
      <View style={s.mosaicoArriba}>
        <IconTile tone={tono} icon={icono} />
        <CaretRight size={Sizes.icon.sm} color={Colors.placeholder} weight="bold" />
      </View>
      <Text variant="title" compact tabular style={s.mosaicoCifra}>
        {String(cantidad)}
      </Text>
      <Text variant="secondary" color="muted" numberOfLines={2}>
        {etiqueta}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  portada: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ALTO_PORTADA,
  },
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Layout.scrollBottomInset,
  },
  seccion: {
    marginBottom: Spacing['2xl'],
  },
  saludo: {
    marginBottom: Spacing.xl,
  },
  pregunta: {
    marginTop: Spacing.xs,
  },
  buscador: {
    ...Shadows.raised,
  },
  actividad: {
    marginTop: Layout.sectionGap,
  },
  mosaicos: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  mosaico: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    padding: Spacing.lg,
    ...Shadows.card,
  },
  mosaicoArriba: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  mosaicoCifra: {
    marginBottom: Spacing.xs,
  },
});
