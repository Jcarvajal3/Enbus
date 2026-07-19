import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, ScrollView, View, Pressable } from '@/tw';
import { StyleSheet, Image, TextInput as RNTextInput } from 'react-native';
import { ArrowLeft, Check, Package, Warning, Star, Camera, Image as ImageIcon, MapPin } from 'phosphor-react-native';
import { LocationSelector } from '@/src/components/LocationSelector';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { Spinner } from '@/src/components/Spinner';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { uploadEvidencePhoto } from '@/src/utils/storage';
import { sanitizeText, validatePhone, validateCedula, validatePeso, validateMonto, validateMinLength } from '@/src/utils/validation';
import { Colors, Typography, Radius, Shadows } from '@/src/theme';
import { Text as TWText } from '@/tw';

// ─── Local Customized Wrappers to apply brand manual ───

// Ensure all texts use 'fontFamily: Typography.family'
const Text = ({ style, ...props }: React.ComponentProps<typeof TWText>) => (
  <TWText
    {...props}
    style={[{ fontFamily: Typography.family }, style]}
  />
);

interface BrandInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'decimal-pad';
  containerStyle?: any;
  multiline?: boolean;
  numberOfLines?: number;
}

// Form fields and inputs: use white background, full corner radius, and no borders
function BrandInput({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  containerStyle,
  multiline,
  numberOfLines,
}: BrandInputProps) {
  return (
    <View style={[{ marginBottom: 16 }, containerStyle]}>
      {label && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: Colors.mutedForeground,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          {label}
        </Text>
      )}
      <View
        style={{
          backgroundColor: Colors.white,
          borderRadius: multiline ? Radius.md : Radius.full,
          borderWidth: 0,
          paddingHorizontal: 16,
          height: multiline ? undefined : 48,
          justifyContent: multiline ? 'flex-start' : 'center',
          paddingVertical: multiline ? 12 : 0,
        }}
      >
        <RNTextInput
          placeholder={placeholder}
          placeholderTextColor={Colors.mutedForeground}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          style={{
            fontSize: 15,
            color: Colors.foreground,
            fontFamily: Typography.family,
            padding: 0,
            margin: 0,
            flex: multiline ? undefined : 1,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </View>
    </View>
  );
}

export default function NuevaEncomiendaWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const toast = useToast();

  // Pre-fill origen/destino if navigated from home search form
  const params = useLocalSearchParams<{
    origen_ciudad?: string;
    origen_estado?: string;
    destino_ciudad?: string;
    destino_estado?: string;
  }>();
  const [foto, setFoto] = useState<string | null>(null);
  // SEC-03: Prevent double-tap on submit by tracking in-flight state via ref
  const submittingRef = useRef(false);

  const foregroundColor = Colors.foreground;

  const handleTakePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      toast.show('error', 'Se requiere acceso a la cámara para tomar fotos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFoto(result.assets[0].uri);
      toast.show('success', 'Foto capturada con éxito');
    }
  };

  const handleSelectPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toast.show('error', 'Se requiere acceso a la galería para seleccionar fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFoto(result.assets[0].uri);
      toast.show('success', 'Foto seleccionada con éxito');
    }
  };

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
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costoEstimado, setCostoEstimado] = useState<number | null>(null);
  const [loadingCosto, setLoadingCosto] = useState(false);

  // Consulta en tiempo real de costo estimado por Edge Function (debounced 500ms)
  useEffect(() => {
    const peso = parseFloat(pesoKg);
    if (isNaN(peso) || peso <= 0 || !origen || !destino) {
      setCostoEstimado(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        setLoadingCosto(true);
        const { data, error } = await supabase.functions.invoke('calculadora-publica', {
          body: {
            peso_kg: peso,
            estado_origen: origen.estado,
            ciudad_origen: origen.ciudad,
            estado_destino: destino.estado,
            ciudad_destino: destino.ciudad
          }
        });

        if (error) throw error;
        if (data && typeof data.costo_estimado === 'number') {
          setCostoEstimado(data.costo_estimado);
        }
      } catch (err: any) {
        console.warn('Error calling calculadora-publica Edge Function:', err.message);
        setCostoEstimado(null);
      } finally {
        setLoadingCosto(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [pesoKg, origen, destino]);

  // Cooperativas/rutas activas para el trayecto seleccionado
  const [rutasDisponibles, setRutasDisponibles] = useState<any[]>([]);
  const [loadingRutas, setLoadingRutas] = useState(false);
  const [rutaSeleccionada, setRutaSeleccionada] = useState<any>(null);

  const [modalidadPago, setModalidadPago] = useState<'ORIGEN' | 'DESTINO'>('DESTINO');

  useEffect(() => {
    if (!origen || !destino) {
      setRutasDisponibles([]);
      setRutaSeleccionada(null);
      return;
    }

    let isMounted = true;
    const fetchRutas = async () => {
      try {
        setLoadingRutas(true);
        const { data, error } = await supabase
          .from('rutas')
          .select(`
            id,
            precio_pasaje,
            cooperativa_id,
            cooperativas ( id, nombre, calificacion_promedio )
          `)
          .eq('ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('ciudad_destino', normalizeCityForDb(destino.ciudad))
          .eq('activa', true);

        if (error) throw error;
        if (isMounted) {
          setRutasDisponibles(data || []);
          setRutaSeleccionada(null);
        }
      } catch (err: any) {
        console.error('Error fetching routes for wizard:', err.message);
      } finally {
        if (isMounted) setLoadingRutas(false);
      }
    };

    fetchRutas();
    return () => { isMounted = false; };
  }, [origen, destino]);

  // SEC-01: Validate step 2 with proper validators instead of raw .length checks
  const isStep1Valid = origen !== null && destino !== null && rutaSeleccionada !== null;
  const isStep2Valid =
    validateMinLength(nombre, 2).valid &&
    validateCedula(cedula).valid &&
    validatePhone(telefono).valid &&
    validateMinLength(descripcion, 3, 'Descripción').valid &&
    validatePeso(pesoKg).valid &&
    validateMonto(valorDeclarado).valid;

  const canContinue = () => {
    if (step === 1) return isStep1Valid;
    if (step === 2) return isStep2Valid;
    return true;
  };

  // SEC-03: handleSubmit protected by ref-based double-submit guard
  const handleSubmit = useCallback(async () => {
    if (step < 3) {
      Haptics.selectionAsync();
      setStep(step + 1);
      return;
    }
    // Guard against double-tap
    if (submittingRef.current) return;
    if (!user) return;

    // SEC-01: Final validation before submit with user-visible errors
    const phoneCheck = validatePhone(telefono);
    if (!phoneCheck.valid) {
      toast.show('error', phoneCheck.message);
      return;
    }
    const cedulaCheck = validateCedula(cedula);
    if (!cedulaCheck.valid) {
      toast.show('error', cedulaCheck.message);
      return;
    }
    const pesoCheck = validatePeso(pesoKg);
    if (!pesoCheck.valid) {
      toast.show('error', pesoCheck.message);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let fotoUrl: string | null = null;
      if (foto) {
        toast.show('info', 'Subiendo foto del paquete...');
        fotoUrl = await uploadEvidencePhoto(foto, user.id);
      }

      // SEC-01: Sanitize all text inputs before sending to DB
      const insertPayload: Record<string, any> = {
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
        cooperativa_id: rutaSeleccionada.cooperativas?.id,
        foto_evidencia_url: fotoUrl,
      };
      if (valorDeclarado) insertPayload.valor_declarado = parseFloat(valorDeclarado);
      
      const { data, error } = await supabase
        .from('encomiendas')
        .insert(insertPayload)
        .select('id')
        .single();
      
      if (error) throw error;
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Encomienda registrada con éxito');
      router.replace({ pathname: '/encomiendas/enviar/[id]', params: { id: data.id } });
    } catch (err: any) {
      console.error('Error creando encomienda:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudo crear la encomienda: ' + err.message);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [step, user, nombre, cedula, telefono, descripcion, pesoKg, valorDeclarado, foto, origen, destino, modalidadPago, rutaSeleccionada, toast, router]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header Stepper */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <Pressable
            onPress={() => step > 1 ? setStep(step - 1) : router.back()}
            style={s.backBtn}
            accessibilityLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
            accessibilityRole="button"
          >
            <ArrowLeft weight="bold" color={foregroundColor} size={22} />
          </Pressable>
          <View style={s.stepperRow}>
            <View style={s.stepperDotsContainer}>
              {[1, 2, 3].map((s2) => {
                const isActive = s2 === step;
                return (
                  <View
                    key={s2}
                    style={isActive ? s.stepperActivePill : s.stepperInactiveDot}
                  />
                );
              })}
            </View>
            <Text style={s.stepperNumber}>
              {`0${step}`}
            </Text>
          </View>
        </View>
        <Text style={s.headerTitle}>
          {step === 1 ? '¿A dónde lo envías?' : step === 2 ? 'Detalles del Envío' : 'Resumen'}
        </Text>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        <View style={s.formCard}>
          {/* ─── Paso 1: Ubicación ─── */}
        {step === 1 && (
          <View>
            <View style={s.searchBarRow}>
              <View style={{ flex: 1 }}>
                <LocationSelector
                  label=""
                  value={origen}
                  onChange={setOrigen}
                  customTrigger={(openModal) => (
                    <Pressable onPress={openModal} style={s.compactInput}>
                      <MapPin size={14} color={Colors.accent} weight="fill" />
                      <Text style={s.compactInputText} numberOfLines={1}>
                        {origen ? origen.ciudad : 'Origen'}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
              <Text style={s.arrowText}>→</Text>
              <View style={{ flex: 1 }}>
                <LocationSelector
                  label=""
                  value={destino}
                  onChange={setDestino}
                  customTrigger={(openModal) => (
                    <Pressable onPress={openModal} style={s.compactInput}>
                      <MapPin size={14} color={Colors.secondary} weight="fill" />
                      <Text style={s.compactInputText} numberOfLines={1}>
                        {destino ? destino.ciudad : 'Destino'}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>
            
            {origen && destino && (
              <View className="mt-6">
                <Text style={s.sectionLabel}>Selecciona Cooperativa</Text>
                {loadingRutas ? (
                  <View className="py-6 items-center">
                    <Spinner />
                  </View>
                ) : rutasDisponibles.length > 0 ? (
                  <View className="gap-3">
                    {rutasDisponibles.map((r) => {
                      const isSelected = rutaSeleccionada?.id === r.id;
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => setRutaSeleccionada(r)}
                          style={[
                            s.routeCard,
                            isSelected && s.routeCardActive,
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View style={s.routeLeftContent}>
                            <View style={s.routeBadgeRow}>
                              {(r.cooperativas?.calificacion_promedio ?? 0) > 0 ? (
                                <View style={s.ratingBadge}>
                                  <Star weight="fill" color={Colors.warning} size={11} />
                                  <Text style={s.ratingBadgeText}>
                                    {Number(r.cooperativas.calificacion_promedio).toFixed(1)} CALIFICACIÓN
                                  </Text>
                                </View>
                              ) : (
                                <View style={[s.ratingBadge, { backgroundColor: 'rgba(138, 138, 138, 0.12)' }]}>
                                  <Text style={[s.ratingBadgeText, { color: Colors.mutedForeground }]}>
                                    SIN CALIFICACIÓN
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.routeTitle} numberOfLines={1}>
                              {r.cooperativas?.nombre}
                            </Text>
                            <Text style={s.routeSubtitle}>
                              {r.precio_pasaje ? `${r.precio_pasaje} Bs` : 'Tarifa variable'}
                            </Text>
                          </View>
                          
                          <View style={[
                            s.routeRightPill, 
                            isSelected ? s.routeRightPillActive : s.routeRightPillInactive
                          ]}>
                            <Text style={[
                              s.routeRightPillText,
                              { color: isSelected ? Colors.white : Colors.secondary }
                            ]}>
                              {r.cooperativas?.nombre ? r.cooperativas.nombre.charAt(0).toUpperCase() : 'C'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={s.alertBox}>
                    <Warning weight="fill" color={Colors.destructive} size={18} />
                    <Text style={[s.alertText, { color: Colors.destructive }]}>
                      No hay rutas activas registradas para este trayecto. Por favor elige otro destino.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {(!origen || !destino) && (
              <View style={s.infoBox}>
                <Text className="text-sm text-muted-foreground leading-5">
                  Las opciones de cooperativas aparecerán en taquilla basándose en estas rutas.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ─── Paso 2: Destinatario + Paquete ─── */}
        {step === 2 && (
          <View>
            <Text style={s.sectionLabel}>Datos de quien recibe</Text>

            <BrandInput
              placeholder="Nombre Completo"
              value={nombre}
              onChangeText={(v) => setNombre(v.slice(0, 80))}
            />
            <BrandInput
              placeholder="Cédula de Identidad"
              keyboardType="number-pad"
              value={cedula}
              onChangeText={(v) => setCedula(v.slice(0, 12))}
            />
            <BrandInput
              placeholder="Teléfono (Ej: +58 414...)"
              keyboardType="phone-pad"
              value={telefono}
              onChangeText={(v) => setTelefono(v.slice(0, 15))}
              containerStyle={{ marginBottom: 24 }}
            />

            <Text style={s.sectionLabel}>Descripción del paquete</Text>
            <BrandInput
              placeholder="¿Qué contiene? (Ej: Documentos, ropa, electrónica...)"
              value={descripcion}
              onChangeText={(v) => setDescripcion(v.slice(0, 300))}
              multiline
              numberOfLines={3}
            />

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <BrandInput
                  label="Peso estimado (kg)"
                  placeholder="Ej: 5"
                  keyboardType="decimal-pad"
                  value={pesoKg}
                  onChangeText={setPesoKg}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
              <View className="flex-1">
                <BrandInput
                  label="Valor declarado ($)"
                  placeholder="Opcional"
                  keyboardType="decimal-pad"
                  value={valorDeclarado}
                  onChangeText={setValorDeclarado}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
            </View>

            {/* Calculadora de costo estimado en tiempo real */}
            {(loadingCosto || costoEstimado !== null) && (
              <View style={{
                marginBottom: 16,
                padding: 16,
                borderRadius: Radius.md,
                backgroundColor: Colors.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <View className="flex-1 mr-2">
                  <Text className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Costo Estimado</Text>
                  <Text className="text-xs text-muted-foreground">Sujeto a pesaje físico en taquilla</Text>
                </View>
                {loadingCosto ? (
                  <Spinner />
                ) : (
                  <Text className="font-heading text-lg text-primary font-black">{Number(costoEstimado).toFixed(2)} Bs.</Text>
                )}
              </View>
            )}

            {/* Foto de Evidencia Opcional */}
            <Text style={s.sectionLabel}>Foto del Paquete (Evidencia Opcional)</Text>
            {foto ? (
              <View style={[{ marginBottom: 16, backgroundColor: Colors.white, padding: 16, borderRadius: Radius.md, alignItems: 'center' }, Shadows.card]}>
                <Image source={{ uri: foto }} style={{ width: '100%', height: 160, borderRadius: Radius.sm, marginBottom: 12 }} resizeMode="cover" />
                <View className="flex-row gap-3 w-full">
                  <Pressable onPress={handleSelectPhoto} style={{ flex: 1, backgroundColor: Colors.surface, paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' }}>
                    <Text style={{ color: Colors.foreground, fontSize: 12, fontWeight: '700' }}>Cambiar foto</Text>
                  </Pressable>
                  <Pressable onPress={() => setFoto(null)} style={{ flex: 1, backgroundColor: Colors.destructiveLight, paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' }}>
                    <Text style={{ color: Colors.destructive, fontSize: 12, fontWeight: '700' }}>Quitar foto</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-3 mb-6">
                <Pressable
                  onPress={handleTakePhoto}
                  style={[
                    {
                      flex: 1,
                      backgroundColor: Colors.white,
                      padding: 16,
                      borderRadius: Radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    Shadows.card,
                  ]}
                >
                  <Camera size={24} color={Colors.primary} weight="fill" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.foreground, marginTop: 8 }}>Tomar Foto</Text>
                </Pressable>
                <Pressable
                  onPress={handleSelectPhoto}
                  style={[
                    {
                      flex: 1,
                      backgroundColor: Colors.white,
                      padding: 16,
                      borderRadius: Radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    Shadows.card,
                  ]}
                >
                  <ImageIcon size={24} color={Colors.primary} weight="fill" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.foreground, marginTop: 8 }}>Galería</Text>
                </Pressable>
              </View>
            )}

            <View style={s.alertBox}>
              <Warning weight="fill" color={Colors.warning} size={18} />
              <Text style={s.alertText}>
                Límites referenciales: Peso máximo 25 kg. Dimensiones máximas 50 × 50 × 50 cm.
                Paquetes fuera de estos límites pueden ser rechazados en taquilla.
              </Text>
            </View>
          </View>
        )}

        {/* ─── Paso 3: Resumen ─── */}
        {step === 3 && (
          <View>
            <View className="items-center mb-8">
              <View style={s.successCircle}>
                <Check weight="bold" color={Colors.success} size={40} />
              </View>
              <Text className="text-2xl font-black text-center mb-2">¡Todo Listo!</Text>
              <Text className="text-sm text-muted-foreground text-center">
                Revisa los datos y genera tu código QR para entregar en taquilla.
              </Text>
            </View>

            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <View className="flex-1">
                  <Text style={s.summaryCaption}>Origen</Text>
                  <Text style={s.summaryValue}>{origen?.ciudad}, {origen?.estado}</Text>
                </View>
                <Text style={s.arrow}>→</Text>
                <View className="flex-1">
                  <Text style={s.summaryCaption}>Destino</Text>
                  <Text style={s.summaryValue}>{destino?.ciudad}, {destino?.estado}</Text>
                </View>
              </View>
              
              <View style={[s.summarySection, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 }]}>
                <Text style={s.summaryCaption}>Cooperativa</Text>
                <Text style={s.summaryValue}>{rutaSeleccionada?.cooperativas?.nombre || 'Ninguna'}</Text>
              </View>
              
              <View style={[s.summarySection, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16, marginTop: 16 }]}>
                <Text style={s.summaryCaption}>Destinatario</Text>
                <Text style={s.summaryValue}>{nombre}</Text>
                <Text style={s.summaryMeta}>C.I: {cedula} · Tel: {telefono}</Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16, marginTop: 16 }}>
                <Text style={s.summaryCaption}>Paquete</Text>
                <Text style={s.summaryValue}>{descripcion}</Text>
                {pesoKg ? <Text style={s.summaryMeta}>Peso estimado: {pesoKg} kg</Text> : null}
                {valorDeclarado ? <Text style={s.summaryMeta}>Valor declarado: ${valorDeclarado}</Text> : null}
                {costoEstimado !== null ? <Text style={s.summaryMeta}>Costo estimado: {costoEstimado.toFixed(2)} Bs.</Text> : null}
              </View>
              {foto ? (
                <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16, marginTop: 16 }}>
                  <Text style={s.summaryCaption}>Foto del Paquete</Text>
                  <Image source={{ uri: foto }} style={{ width: '100%', height: 160, borderRadius: Radius.sm, marginTop: 8 }} resizeMode="cover" />
                </View>
              ) : null}
            </View>

            {/* Modalidad de pago */}
            <Text style={s.sectionLabel}>Modalidad de Pago</Text>
            <View className="flex-row gap-3 mb-6">
              <Pressable
                onPress={() => setModalidadPago('ORIGEN')}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: Radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: modalidadPago === 'ORIGEN' ? Colors.primaryLight : Colors.white,
                  borderWidth: modalidadPago === 'ORIGEN' ? 1.5 : 0,
                  borderColor: Colors.primary,
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: modalidadPago === 'ORIGEN' }}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    fontSize: 14,
                    color: Colors.foreground,
                  }}
                >
                  Cobro en Origen
                </Text>
                <Text style={{ fontSize: 12, color: Colors.mutedForeground, marginTop: 4, textAlign: 'center' }}>
                  Pagas al entregar
                </Text>
              </Pressable>
              
              <Pressable
                onPress={() => setModalidadPago('DESTINO')}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: Radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: modalidadPago === 'DESTINO' ? Colors.primaryLight : Colors.white,
                  borderWidth: modalidadPago === 'DESTINO' ? 1.5 : 0,
                  borderColor: Colors.primary,
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: modalidadPago === 'DESTINO' }}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    fontSize: 14,
                    color: Colors.foreground,
                  }}
                >
                  Cobro en Destino
                </Text>
                <Text style={{ fontSize: 12, color: Colors.mutedForeground, marginTop: 4, textAlign: 'center' }}>
                  Paga al recibir
                </Text>
              </Pressable>
            </View>

            <View style={s.infoBox}>
              <Text className="text-xs text-muted-foreground leading-4 text-center">
                El costo final será calculado en taquilla según el peso real medido por la cooperativa.
              </Text>
            </View>
          </View>
        )}
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={s.footer}>
        <Pressable
          style={[s.ctaBtn, !canContinue() && s.ctaDisabled]}
          disabled={!canContinue() || isSubmitting}
          onPress={handleSubmit}
          accessibilityLabel={step === 3 ? 'Generar Código QR' : 'Continuar al siguiente paso'}
          accessibilityRole="button"
        >
          {isSubmitting ? <Spinner /> : (
            <Text style={s.ctaText}>
              {step === 3 ? 'Generar Código QR' : 'Continuar'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperActivePill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.foreground,
  },
  stepperInactiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  stepperNumber: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    marginTop: 16,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  alertText: {
    fontSize: 12,
    color: Colors.mutedForeground,
    flex: 1,
    lineHeight: 18,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
  },
  summarySection: { marginTop: 8 },
  summaryCaption: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: { fontSize: 14, fontWeight: '700', color: Colors.foreground, marginBottom: 2 },
  summaryMeta: { fontSize: 13, color: Colors.mutedForeground },
  arrow: { fontSize: 18, color: Colors.mutedForeground, marginHorizontal: 12 },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ctaBtn: {
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceDark,
    padding: 6,
    borderRadius: Radius.full,
    marginBottom: 8,
  },
  compactInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    height: 38,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    gap: 6,
  },
  compactInputText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 13,
    color: Colors.foreground,
    flex: 1,
  },
  arrowText: {
    fontSize: 14,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  routeCardActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.accent,
  },
  routeLeftContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  routeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningLight,
    gap: 4,
  },
  ratingBadgeText: {
    fontSize: 9,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.warning,
  },
  routeTitle: {
    fontSize: 16,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginTop: 6,
    marginBottom: 6,
  },
  routeSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
  },
  routeRightPill: {
    width: 50,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  routeRightPillActive: {
    backgroundColor: Colors.accent,
  },
  routeRightPillInactive: {
    backgroundColor: 'rgba(255, 118, 72, 0.12)',
  },
  routeRightPillText: {
    fontSize: 24,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
});
