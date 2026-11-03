/**
 * Inicio — la marca en la misma cabecera que las demás pestañas (AN-22), tu
 * próximo viaje si lo hay, el buscador y "Tu actividad" solo con algo en curso
 * (AN-24, AU-41).
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
import { Screen, ScreenHeader, SectionLabel, Text } from '@/src/components/ui';
import { nombreValido } from '@/src/utils/validation';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora del teléfono. */
function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen() {
  const router = useRouter();
  const { boletosActivos, encomiendasActivas } = useActivity();
  const { proximo } = useProximoViaje();
  const { perfil } = usePerfil();

  // Solo el nombre real (AU-07): nunca el prefijo del correo ni "Usuario EnBus".
  const nombre = nombreValido(perfil?.nombre_completo)
    ? (perfil?.nombre_completo ?? '').trim().split(/\s+/)[0]
    : null;

  const hayActividad = boletosActivos > 0 || encomiendasActivas > 0;

  return (
    <Screen>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* El contador de no leídas sale de ActivityContext (un solo canal). */}
      <ScreenHeader title={<BrandMark conNombre />} right={<HeaderActions />} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tu próximo viaje (APP-16) ──────────────────────────────────── */}
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
        <StaggerItem index={0}>
          <Text variant="secondary" color="muted">
            {saludo()}
          </Text>
          <Text variant="heading" accessibilityRole="header" style={s.pregunta}>
            {nombre ? `¿A dónde vamos, ${nombre}?` : '¿A dónde vamos hoy?'}
          </Text>
        </StaggerItem>

        <StaggerItem index={1}>
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
        </StaggerItem>

        {/* ── Actividad en curso: solo lo que tiene algo ──────────────────── */}
        {hayActividad ? (
          <StaggerItem index={2} style={s.actividad}>
            <SectionLabel>Tu actividad</SectionLabel>
            <View style={s.mosaicos}>
              {boletosActivos > 0 ? (
                <Mosaico
                  icono={Ticket}
                  cantidad={boletosActivos}
                  etiqueta={boletosActivos === 1 ? 'Boleto activo' : 'Boletos activos'}
                  tinte={Colors.accentStrong}
                  fondoTinte={Colors.accentLight}
                  onPress={() => router.push('/(tabs)/boletos')}
                />
              ) : null}
              {encomiendasActivas > 0 ? (
                <Mosaico
                  icono={Package}
                  cantidad={encomiendasActivas}
                  etiqueta={encomiendasActivas === 1 ? 'Encomienda activa' : 'Encomiendas activas'}
                  tinte={Colors.secondary}
                  fondoTinte={Colors.secondaryLight}
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

// ─── Fila de actividad ───────────────────────────────────────────────────────

/** Acceso a una lista con algo en curso: icono del dominio, nombre y cuántos hay. */
function Mosaico({
  icono: Icono,
  cantidad,
  etiqueta,
  tinte,
  fondoTinte,
  onPress,
}: {
  icono: React.ComponentType<IconProps>;
  cantidad: number;
  etiqueta: string;
  tinte: string;
  fondoTinte: string;
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
      <View style={[s.mosaicoIcono, { backgroundColor: fondoTinte }]}>
        <Icono size={Sizes.icon.md} color={tinte} weight="bold" />
      </View>
      <Text variant="bodyStrong" numberOfLines={1} style={s.mosaicoEtiqueta}>
        {etiqueta}
      </Text>
      <Text variant="heading" compact>
        {String(cantidad)}
      </Text>
      <CaretRight size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Layout.scrollBottomInset,
  },
  seccion: {
    marginBottom: Spacing['2xl'],
  },
  pregunta: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  actividad: {
    marginTop: Spacing['2xl'],
  },
  mosaicos: {
    gap: Spacing.md,
  },
  mosaico: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  mosaicoEtiqueta: {
    flex: 1,
  },
  mosaicoIcono: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
