import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Camera,
  Check,
  Image as ImageIcon,
  MapPin,
  Package,
  Star,
  Warning,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LocationSelector } from '@/src/components/LocationSelector';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  EntityCard,
  Field,
  FloatingBar,
  InfoRow,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionLabel,
  SegmentedControl,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { uploadEvidencePhoto } from '@/src/utils/storage';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import {
  sanitizeText,
  validateCedula,
  validateMinLength,
  validateMonto,
  validatePeso,
  validatePhone,
} from '@/src/utils/validation';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

type ModalidadPago = 'ORIGEN' | 'DESTINO';

interface RutaDisponible {
  id: string;
  precio_pasaje?: number;
  cooperativas?: { id: string; nombre: string; calificacion_promedio?: number };
}

const STEP_TITLES = ['¿A dónde lo envías?', 'Detalles del envío', 'Revisa y confirma'];

export default function NuevaEncomiendaWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const params = useLocalSearchParams<{
    origen_ciudad?: string;
    origen_estado?: string;
    destino_ciudad?: string;
    destino_estado?: string;
  }>();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [origen, setOrigen] = useState<Localidad | null>(
    params.origen_ciudad && params.origen_estado
      ? { ciudad: params.origen_ciudad, estado: params.origen_estado }
      : null
  );
  const [destino, setDestino] = useState<Localidad | null>(
    params.destino_ciudad && params.destino_estado
      ? { ciudad: params.destino_ciudad, estado: params.destino_estado }
      : null
  );

  const [rutas, setRutas] = useState<RutaDisponible[]>([]);
  const [loadingRutas, setLoadingRutas] = useState(false);
  const [ruta, setRuta] = useState<RutaDisponible | null>(null);

  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [foto, setFoto] = useState<string | null>(null);
  const [modalidadPago, setModalidadPago] = useState<ModalidadPago>('DESTINO');

  const [costoEstimado, setCostoEstimado] = useState<number | null>(null);
  const [loadingCosto, setLoadingCosto] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // ── Rutas activas para el trayecto ───────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setRutas([]);
      setRuta(null);
      return;
    }

    let isMounted = true;
    const fetchRutas = async () => {
      try {
        setLoadingRutas(true);
        const { data, error } = await supabase
          .from('rutas')
          .select('id, precio_pasaje, cooperativa_id, cooperativas ( id, nombre, calificacion_promedio )')
          .eq('ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('ciudad_destino', normalizeCityForDb(destino.ciudad))
          .eq('activa', true);

        if (error) throw error;
        if (isMounted) {
          setRutas((data ?? []) as unknown as RutaDisponible[]);
          setRuta(null);
        }
      } catch (err) {
        if (__DEV__) console.error('[nueva] Error cargando rutas:', err);
      } finally {
        if (isMounted) setLoadingRutas(false);
      }
    };

    fetchRutas();
    return () => {
      isMounted = false;
    };
  }, [origen, destino]);

  // ── Costo estimado (Edge Function, debounced) ────────────────────────────
  useEffect(() => {
    const peso = parseFloat(pesoKg);
    if (Number.isNaN(peso) || peso <= 0 || !origen || !destino) {
      setCostoEstimado(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoadingCosto(true);
        const { data, error } = await supabase.functions.invoke('calculadora-publica', {
          body: {
            peso_kg: peso,
            estado_origen: origen.estado,
            ciudad_origen: origen.ciudad,
            estado_destino: destino.estado,
            ciudad_destino: destino.ciudad,
          },
        });
        if (error) throw error;
        setCostoEstimado(typeof data?.costo_estimado === 'number' ? data.costo_estimado : null);
      } catch (err) {
        if (__DEV__) console.warn('[nueva] Calculadora no disponible:', err);
        setCostoEstimado(null);
      } finally {
        setLoadingCosto(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pesoKg, origen, destino]);

  // ── Fotos ────────────────────────────────────────────────────────────────
  const pickPhoto = async (source: 'camera' | 'library') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      toast.show(
        'error',
        source === 'camera'
          ? 'Se requiere acceso a la cámara para tomar fotos.'
          : 'Se requiere acceso a la galería para seleccionar fotos.'
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.length) {
      setFoto(result.assets[0].uri);
    }
  };

  // ── Validación ───────────────────────────────────────────────────────────
  const validateStep2 = useCallback((): boolean => {
    const checks: [string, { valid: boolean; message?: string }][] = [
      ['nombre', validateMinLength(nombre, 2)],
      ['cedula', validateCedula(cedula)],
      ['telefono', validatePhone(telefono)],
      ['descripcion', validateMinLength(descripcion, 3, 'Descripción')],
      ['peso', validatePeso(pesoKg)],
      ['valor', validateMonto(valorDeclarado)],
    ];

    const next: Record<string, string> = {};
    checks.forEach(([key, result]) => {
      if (!result.valid) next[key] = result.message ?? 'Revisa este campo.';
    });

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [nombre, cedula, telefono, descripcion, pesoKg, valorDeclarado]);

  const step1Valid = !!origen && !!destino && !!ruta;

  const handleContinue = useCallback(async () => {
    if (step === 1) {
      Haptics.selectionAsync();
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!validateStep2()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.selectionAsync();
      setStep(3);
      return;
    }

    // Paso 3 — guardar. `submittingRef` protege contra doble toque.
    if (submittingRef.current || !user || !ruta) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let fotoUrl: string | null = null;
      if (foto) {
        toast.show('info', 'Subiendo foto del paquete…');
        fotoUrl = await uploadEvidencePhoto(foto, user.id);
      }

      const payload: Record<string, unknown> = {
        sender_id: user.id,
        receiver_nombre: sanitizeText(nombre),
        receiver_cedula_rif: sanitizeText(cedula),
        receiver_telefono: sanitizeText(telefono),
        estado_origen: origen?.estado,
        ciudad_origen: origen?.ciudad,
        estado_destino: destino?.estado,
        ciudad_destino: destino?.ciudad,
        descripcion_contenido: sanitizeText(descripcion),
        peso_kg: pesoKg ? parseFloat(pesoKg) : null,
        estado: 'PENDIENTE_DE_ESCANEO',
        modalidad_pago: modalidadPago,
        cooperativa_id: ruta.cooperativas?.id,
        foto_evidencia_url: fotoUrl,
      };
      if (valorDeclarado) payload.valor_declarado = parseFloat(valorDeclarado);

      const { data, error } = await supabase
        .from('encomiendas')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Encomienda registrada con éxito');
      router.replace({ pathname: '/encomiendas/enviar/[id]', params: { id: data.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (__DEV__) console.error('[nueva] Error creando encomienda:', message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo crear la encomienda: ${message}`);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [
    step,
    validateStep2,
    user,
    ruta,
    foto,
    nombre,
    cedula,
    telefono,
    origen,
    destino,
    descripcion,
    pesoKg,
    valorDeclarado,
    modalidadPago,
    toast,
    router,
  ]);

  const canContinue = step === 1 ? step1Valid : true;

  return (
    <Screen>
      <ScreenHeader
        variant="steps"
        title={STEP_TITLES[step - 1]}
        step={step}
        totalSteps={3}
        onBack={() => (step > 1 ? setStep((prev) => (prev - 1) as 1 | 2) : router.back())}
        backLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ floatingAction: true, top: Spacing.sm })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Paso 1: ruta y cooperativa ───────────────────────────────── */}
        {step === 1 && (
          <>
            <Card tone="sunken" padding="sm" elevated={false} radius="2xl">
              <View style={s.routeBar}>
                <LocationSelector
                  label="Origen"
                  value={origen}
                  onChange={setOrigen}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={origen?.ciudad}
                      placeholder="Origen"
                      tint={Colors.accent}
                      onPress={open}
                    />
                  )}
                />
                <Text variant="caption" color="muted" compact>
                  →
                </Text>
                <LocationSelector
                  label="Destino"
                  value={destino}
                  onChange={setDestino}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={destino?.ciudad}
                      placeholder="Destino"
                      tint={Colors.secondary}
                      onPress={open}
                    />
                  )}
                />
              </View>
            </Card>

            <View style={s.section}>
              {!origen || !destino ? (
                <EmptyState
                  icon={MapPin}
                  title="Elige el trayecto"
                  description="Selecciona origen y destino para ver qué cooperativas cubren esa ruta."
                  compact
                />
              ) : loadingRutas ? (
                <LoadingState label="Buscando cooperativas…" compact />
              ) : rutas.length === 0 ? (
                <EmptyState
                  icon={Warning}
                  title="Sin rutas activas"
                  description="Ninguna cooperativa cubre este trayecto por ahora. Prueba con otro destino."
                  compact
                />
              ) : (
                <>
                  <SectionLabel>Selecciona la cooperativa</SectionLabel>
                  {rutas.map((option, index) => {
                    const nombreCoop = option.cooperativas?.nombre ?? 'Cooperativa';
                    const rating = option.cooperativas?.calificacion_promedio ?? 0;

                    return (
                      <StaggerItem key={option.id} index={index}>
                        <EntityCard
                          selectable
                          selected={ruta?.id === option.id}
                          onPress={() => setRuta(option)}
                          title={nombreCoop}
                          subtitle={
                            option.precio_pasaje
                              ? `Tarifa referencial ${option.precio_pasaje} Bs`
                              : 'Tarifa según peso en taquilla'
                          }
                          initial={nombreCoop.charAt(0).toUpperCase()}
                          tone="brand"
                          badge={
                            rating > 0 ? (
                              <Badge tone="pending" icon={Star}>
                                {rating.toFixed(1)}
                              </Badge>
                            ) : (
                              <Badge tone="neutral">Sin calificación</Badge>
                            )
                          }
                        />
                      </StaggerItem>
                    );
                  })}
                </>
              )}
            </View>
          </>
        )}

        {/* ─── Paso 2: destinatario y paquete ───────────────────────────── */}
        {step === 2 && (
          <>
            <Card tone="sunken" padding="md" elevated={false}>
              <SectionLabel>Datos de quien recibe</SectionLabel>

              <Field
                label="Nombre completo"
                placeholder="Juan Pérez"
                value={nombre}
                onChangeText={(v) => setNombre(v.slice(0, 80))}
                error={errors.nombre}
              />
              <Field
                label="Cédula de identidad"
                placeholder="V-12345678"
                keyboardType="default"
                value={cedula}
                onChangeText={(v) => setCedula(v.slice(0, 12))}
                error={errors.cedula}
              />
              <Field
                label="Teléfono"
                placeholder="04141234567"
                keyboardType="phone-pad"
                value={telefono}
                onChangeText={(v) => setTelefono(v.slice(0, 15))}
                error={errors.telefono}
                containerStyle={s.lastField}
              />
            </Card>

            <Card tone="sunken" padding="md" elevated={false} style={s.section}>
              <SectionLabel>Contenido del paquete</SectionLabel>

              <Field
                label="¿Qué contiene?"
                placeholder="Documentos, ropa, electrónica…"
                value={descripcion}
                onChangeText={(v) => setDescripcion(v.slice(0, 300))}
                error={errors.descripcion}
                multiline
                numberOfLines={3}
              />

              <View style={s.fieldRow}>
                <Field
                  label="Peso estimado (kg)"
                  placeholder="5"
                  keyboardType="decimal-pad"
                  value={pesoKg}
                  onChangeText={setPesoKg}
                  error={errors.peso}
                  containerStyle={s.fieldHalf}
                />
                <Field
                  label="Valor declarado ($)"
                  placeholder="Opcional"
                  keyboardType="decimal-pad"
                  value={valorDeclarado}
                  onChangeText={setValorDeclarado}
                  error={errors.valor}
                  containerStyle={s.fieldHalf}
                />
              </View>

              {(loadingCosto || costoEstimado !== null) && (
                <View style={s.costRow}>
                  <View style={s.costLabel}>
                    <Text variant="overline" color="muted" uppercase>
                      Costo estimado
                    </Text>
                    <Text variant="caption" color="muted">
                      Sujeto a pesaje físico en taquilla
                    </Text>
                  </View>
                  {loadingCosto ? (
                    <Text variant="caption" color="muted">
                      Calculando…
                    </Text>
                  ) : (
                    <Text variant="heading" color="primary" compact>
                      {`${Number(costoEstimado).toFixed(2)} Bs`}
                    </Text>
                  )}
                </View>
              )}

              <View style={s.alert}>
                <Warning weight="fill" color={Colors.warning} size={Sizes.icon.md} />
                <Text variant="caption" color="muted" style={s.alertText}>
                  Peso máximo 25 kg y dimensiones máximas 50 × 50 × 50 cm. Los paquetes fuera de
                  estos límites pueden ser rechazados en taquilla.
                </Text>
              </View>
            </Card>

            <Card tone="sunken" padding="md" elevated={false} style={s.section}>
              <SectionLabel>Foto del paquete (opcional)</SectionLabel>

              {foto ? (
                <>
                  <Image source={{ uri: foto }} style={s.photo} resizeMode="cover" />
                  <View style={s.photoActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => pickPhoto('library')}
                      style={s.photoButton}
                    >
                      Cambiar foto
                    </Button>
                    <Button
                      variant="dangerSoft"
                      size="sm"
                      onPress={() => setFoto(null)}
                      style={s.photoButton}
                    >
                      Quitar foto
                    </Button>
                  </View>
                </>
              ) : (
                <View style={s.photoActions}>
                  <PhotoOption icon={Camera} label="Tomar foto" onPress={() => pickPhoto('camera')} />
                  <PhotoOption
                    icon={ImageIcon}
                    label="Galería"
                    onPress={() => pickPhoto('library')}
                  />
                </View>
              )}
            </Card>
          </>
        )}

        {/* ─── Paso 3: resumen ──────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <View style={s.successBlock}>
              <View style={s.successIcon}>
                <Check weight="bold" color={Colors.success} size={Sizes.icon['2xl']} />
              </View>
              <Text variant="heading" size="2xl" align="center">
                ¡Todo listo!
              </Text>
              <Text variant="secondary" color="muted" align="center" style={s.successText}>
                Revisa los datos y genera tu código QR para entregar en taquilla.
              </Text>
            </View>

            <Card padding="md">
              <View style={s.summaryRow}>
                <InfoRow label="Origen" value={`${origen?.ciudad}, ${origen?.estado}`} />
                <InfoRow
                  label="Destino"
                  value={`${destino?.ciudad}, ${destino?.estado}`}
                  align="right"
                />
              </View>

              <Divider />

              <InfoRow label="Cooperativa" value={ruta?.cooperativas?.nombre ?? 'Ninguna'} />

              <Divider />

              <InfoRow label="Destinatario" value={nombre} />
              <Text variant="caption" color="muted">
                {`C.I. ${cedula} · Tel. ${telefono}`}
              </Text>

              <Divider />

              <InfoRow label="Paquete" value={descripcion} />
              <Text variant="caption" color="muted">
                {[
                  pesoKg ? `${pesoKg} kg` : null,
                  valorDeclarado ? `Valor declarado $${valorDeclarado}` : null,
                  costoEstimado !== null ? `Estimado ${costoEstimado.toFixed(2)} Bs` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>

              {foto ? (
                <>
                  <Divider />
                  <Text variant="overline" color="muted" uppercase>
                    Foto del paquete
                  </Text>
                  <Image source={{ uri: foto }} style={s.photoSummary} resizeMode="cover" />
                </>
              ) : null}
            </Card>

            <View style={s.section}>
              <SectionLabel>¿Quién paga el envío?</SectionLabel>
              <SegmentedControl<ModalidadPago>
                value={modalidadPago}
                onChange={setModalidadPago}
                options={[
                  { value: 'ORIGEN', label: 'Pago yo ahora' },
                  { value: 'DESTINO', label: 'Paga quien recibe' },
                ]}
              />
              <Text variant="caption" color="muted" align="center" style={s.modalidadHint}>
                {modalidadPago === 'ORIGEN'
                  ? 'Pagarás el envío al entregar el paquete en taquilla.'
                  : 'El destinatario pagará al retirar el paquete.'}
              </Text>
            </View>

            <View style={s.note}>
              <Package weight="fill" color={Colors.mutedForeground} size={Sizes.icon.md} />
              <Text variant="caption" color="muted" style={s.alertText}>
                El costo final se calcula en taquilla según el peso real medido por la cooperativa.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <FloatingBar>
        <Button
          variant="accent"
          fullWidth
          disabled={!canContinue}
          loading={isSubmitting}
          onPress={handleContinue}
        >
          {step === 3 ? 'Generar código QR' : 'Continuar'}
        </Button>
      </FloatingBar>
    </Screen>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CompactLocation({
  value,
  placeholder,
  tint,
  onPress,
}: {
  value?: string;
  placeholder: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleValue={Motion.press.button}
      style={s.compact}
      accessibilityRole="button"
      accessibilityLabel={`${placeholder}: ${value ?? 'sin seleccionar'}`}
    >
      <MapPin size={Sizes.icon.sm} color={tint} weight="fill" />
      <Text
        variant="bodyStrong"
        size="sm"
        color={value ? 'foreground' : 'muted'}
        numberOfLines={1}
        compact
        style={s.compactText}
      >
        {value ?? placeholder}
      </Text>
    </PressableScale>
  );
}

function PhotoOption({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; weight?: 'fill' }>;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.photoOption}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={Sizes.icon.xl} color={Colors.primary} weight="fill" />
      <Text variant="label" style={s.photoOptionLabel}>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  routeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.full,
    padding: Spacing.xs + 2,
  },
  compact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    height: Sizes.control.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
  },
  compactText: {
    flex: 1,
  },
  section: {
    marginTop: Spacing.xl,
  },
  lastField: {
    marginBottom: 0,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  fieldHalf: {
    flex: 1,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  costLabel: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  alertText: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  photoSummary: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  photoActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  photoButton: {
    flex: 1,
  },
  photoOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
  },
  photoOptionLabel: {
    textAlign: 'center',
  },
  successBlock: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  successIcon: {
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  successText: {
    marginTop: Spacing.sm,
    maxWidth: 300,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  modalidadHint: {
    marginTop: Spacing.md,
  },
});
