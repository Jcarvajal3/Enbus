import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { StyleSheet, Image } from 'react-native';
import { CaretLeft, Check, Package, Warning, Star, Camera, Image as ImageIcon } from 'phosphor-react-native';
import { LocationSelector } from '@/src/components/LocationSelector';
import { InputField } from '@/src/components/InputField';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { Spinner } from '@/src/components/Spinner';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { uploadEvidencePhoto } from '@/src/utils/storage';
import { sanitizeText, validatePhone, validateCedula, validatePeso, validateMonto, validateMinLength } from '@/src/utils/validation';

export default function NuevaEncomiendaWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const toast = useToast();
  const [foto, setFoto] = useState<string | null>(null);
  // SEC-03: Prevent double-tap on submit by tracking in-flight state via ref
  const submittingRef = useRef(false);

  // BUG-08: use CSS variables instead of hardcoded colors in StyleSheet
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

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

  const [origen, setOrigen] = useState<Localidad | null>(null);
  const [destino, setDestino] = useState<Localidad | null>(null);
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
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => step > 1 ? setStep(step - 1) : router.back()}
            style={s.backBtn}
            accessibilityLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
            accessibilityRole="button"
          >
            {/* BUG-08 fix: foregroundColor from CSS var */}
            <CaretLeft weight="bold" color={foregroundColor} size={22} />
          </Pressable>
          <Text className="font-heading text-xl text-foreground">
            {step === 1 ? '¿A dónde lo envías?' : step === 2 ? 'Detalles del Envío' : 'Resumen'}
          </Text>
        </View>
        {/* Progress Bar */}
        <View className="flex-row gap-2">
          {[1, 2, 3].map((s2) => (
            <View key={s2} style={[s.progressBar, s2 <= step ? s.progressActive : s.progressInactive]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {/* ─── Paso 1: Ubicación ─── */}
        {step === 1 && (
          <View>
            <LocationSelector label="Desde (Tu ubicación)" value={origen} onChange={setOrigen} />
            <View className="h-4" />
            <LocationSelector label="Hacia (Destino)" value={destino} onChange={setDestino} />
            
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
                          className={`flex-row items-center justify-between p-4 bg-card border rounded-[10px] ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View className="flex-row items-center gap-3">
                            <View className="size-10 bg-primary/10 rounded-full items-center justify-center">
                              <Package color="#e2b714" size={20} weight="fill" />
                            </View>
                            <View>
                              <Text className="text-sm font-bold text-foreground">{r.cooperativas?.nombre}</Text>
                              {(r.cooperativas?.calificacion_promedio ?? 0) > 0 && (
                                <View className="flex-row items-center mt-0.5">
                                  <Star weight="fill" color="#e2b714" size={12} />
                                  <Text className="text-xs text-muted-foreground ml-1">
                                    {Number(r.cooperativas.calificacion_promedio).toFixed(1)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <Text className="text-sm font-black text-primary">
                            {r.precio_pasaje ? `${r.precio_pasaje} Bs` : 'Tarifa variable'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={s.alertBox}>
                    <Warning weight="fill" color="#dc2626" size={18} />
                    <Text style={[s.alertText, { color: '#dc2626' }]}>
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

            {/* SEC-01: maxLength to prevent oversized DB inserts */}
            <InputField
              placeholder="Nombre Completo"
              value={nombre}
              onChangeText={(v) => setNombre(v.slice(0, 80))}
            />
            <InputField
              placeholder="Cédula de Identidad"
              keyboardType="number-pad"
              value={cedula}
              onChangeText={(v) => setCedula(v.slice(0, 12))}
            />
            <InputField
              placeholder="Teléfono (Ej: +58 414...)"
              keyboardType="phone-pad"
              value={telefono}
              onChangeText={(v) => setTelefono(v.slice(0, 15))}
              containerStyle={{ marginBottom: 24 }}
            />

            <Text style={s.sectionLabel}>Descripción del paquete</Text>
            <InputField
              placeholder="¿Qué contiene? (Ej: Documentos, ropa, electrónica...)"
              value={descripcion}
              onChangeText={(v) => setDescripcion(v.slice(0, 300))}
              multiline
              numberOfLines={3}
            />

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <InputField
                  label="Peso estimado (kg)"
                  placeholder="Ej: 5"
                  keyboardType="decimal-pad"
                  value={pesoKg}
                  onChangeText={setPesoKg}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
              <View className="flex-1">
                <InputField
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
              <View className="mb-4 p-4 rounded-[10px] bg-secondary border border-border/30 flex-row justify-between items-center">
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
              <View className="mb-4 bg-card border border-border p-4 rounded-[14px] items-center">
                <Image source={{ uri: foto }} style={{ width: '100%', height: 160, borderRadius: 8, marginBottom: 12 }} resizeMode="cover" />
                <View className="flex-row gap-3 w-full">
                  <Pressable onPress={handleSelectPhoto} className="flex-1 bg-secondary py-2.5 rounded-[10px] items-center">
                    <Text className="text-foreground text-xs font-bold">Cambiar foto</Text>
                  </Pressable>
                  <Pressable onPress={() => setFoto(null)} className="flex-1 bg-destructive/10 py-2.5 rounded-[10px] items-center">
                    <Text className="text-destructive text-xs font-bold">Quitar foto</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-3 mb-6">
                <Pressable onPress={handleTakePhoto} className="flex-1 bg-card border border-border p-4 rounded-[14px] items-center justify-center">
                  <Camera size={24} color="#e2b714" weight="fill" />
                  <Text className="text-xs font-bold text-foreground mt-2">Tomar Foto</Text>
                </Pressable>
                <Pressable onPress={handleSelectPhoto} className="flex-1 bg-card border border-border p-4 rounded-[14px] items-center justify-center">
                  <ImageIcon size={24} color="#e2b714" weight="fill" />
                  <Text className="text-xs font-bold text-foreground mt-2">Galería</Text>
                </Pressable>
              </View>
            )}

            <View style={s.alertBox}>
              <Warning weight="fill" color="#e2b714" size={18} />
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
                <Check weight="bold" color="#16a34a" size={40} />
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
              
              <View style={[s.summarySection, { borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 16 }]}>
                <Text style={s.summaryCaption}>Cooperativa</Text>
                <Text style={s.summaryValue}>{rutaSeleccionada?.cooperativas?.nombre || 'Ninguna'}</Text>
              </View>
              
              <View style={[s.summarySection, { borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 16, marginTop: 16 }]}>
                <Text style={s.summaryCaption}>Destinatario</Text>
                <Text style={s.summaryValue}>{nombre}</Text>
                <Text style={s.summaryMeta}>C.I: {cedula} · Tel: {telefono}</Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 16, marginTop: 16 }}>
                <Text style={s.summaryCaption}>Paquete</Text>
                <Text style={s.summaryValue}>{descripcion}</Text>
                {pesoKg ? <Text style={s.summaryMeta}>Peso estimado: {pesoKg} kg</Text> : null}
                {valorDeclarado ? <Text style={s.summaryMeta}>Valor declarado: ${valorDeclarado}</Text> : null}
                {costoEstimado !== null ? <Text style={s.summaryMeta}>Costo estimado: {costoEstimado.toFixed(2)} Bs.</Text> : null}
              </View>
              {foto ? (
                <View style={{ borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 16, marginTop: 16 }}>
                  <Text style={s.summaryCaption}>Foto del Paquete</Text>
                  <Image source={{ uri: foto }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                </View>
              ) : null}
            </View>

            {/* Modalidad de pago */}
            <Text style={s.sectionLabel}>Modalidad de Pago</Text>
            <View className="flex-row gap-3 mb-6">
              <Pressable
                onPress={() => setModalidadPago('ORIGEN')}
                className={`flex-1 p-4 rounded-[10px] border items-center justify-center ${modalidadPago === 'ORIGEN' ? 'bg-primary/5 border-primary' : 'bg-card border-border'}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: modalidadPago === 'ORIGEN' }}
              >
                <Text className={`font-bold text-sm ${modalidadPago === 'ORIGEN' ? 'text-primary' : 'text-foreground'}`}>
                  Cobro en Origen
                </Text>
                <Text className="text-xs text-muted-foreground mt-1 text-center">Pagas al entregar</Text>
              </Pressable>
              
              <Pressable
                onPress={() => setModalidadPago('DESTINO')}
                className={`flex-1 p-4 rounded-[10px] border items-center justify-center ${modalidadPago === 'DESTINO' ? 'bg-primary/5 border-primary' : 'bg-card border-border'}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: modalidadPago === 'DESTINO' }}
              >
                <Text className={`font-bold text-sm ${modalidadPago === 'DESTINO' ? 'text-primary' : 'text-foreground'}`}>
                  Cobro en Destino
                </Text>
                <Text className="text-xs text-muted-foreground mt-1 text-center">Paga al recibir</Text>
              </Pressable>
            </View>

            <View style={s.infoBox}>
              <Text className="text-xs text-muted-foreground leading-4 text-center">
                El costo final será calculado en taquilla según el peso real medido por la cooperativa.
              </Text>
            </View>
          </View>
        )}
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 99,
  },
  progressActive: { backgroundColor: '#e2b714' },
  progressInactive: { backgroundColor: '#f4f4f5' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#737373',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fdf5d3',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  alertText: {
    fontSize: 12,
    color: '#737373',
    flex: 1,
    lineHeight: 18,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e5e5',
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
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#171717', marginBottom: 2 },
  summaryMeta: { fontSize: 13, color: '#737373' },
  arrow: { fontSize: 18, color: '#a1a1aa', marginHorizontal: 12 },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  ctaBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e2b714',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: '#e2b71480' },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b4a1a',
  },
});
