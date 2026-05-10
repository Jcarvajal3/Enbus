import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, View, Text, Pressable } from '@/tw';
import { StyleSheet } from 'react-native';
import { CaretLeft, Check, Package, Warning } from 'phosphor-react-native';
import { LocationSelector } from '@/src/components/LocationSelector';
import { InputField } from '@/src/components/InputField';
import { Localidad } from '@/src/utils/venezuela';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { Spinner } from '@/src/components/Spinner';

export default function NuevaEncomiendaWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  const [origen, setOrigen] = useState<Localidad | null>(null);
  const [destino, setDestino] = useState<Localidad | null>(null);
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStep1Valid = origen !== null && destino !== null;
  const isStep2Valid =
    nombre.trim().length >= 2 &&
    cedula.trim().length >= 4 &&
    telefono.trim().length >= 8 &&
    descripcion.trim().length >= 3;

  const canContinue = () => {
    if (step === 1) return isStep1Valid;
    if (step === 2) return isStep2Valid;
    return true;
  };

  const handleSubmit = async () => {
    if (step < 3) { setStep(step + 1); return; }
    if (!user) return;
    setIsSubmitting(true);
    try {
      const insertPayload: Record<string, any> = {
        sender_id: user.id,
        receiver_nombre: nombre.trim(),
        receiver_cedula_rif: cedula.trim(),
        receiver_telefono: telefono.trim(),
        estado_origen: origen?.estado,
        ciudad_origen: origen?.ciudad,
        estado_destino: destino?.estado,
        ciudad_destino: destino?.ciudad,
        descripcion_contenido: descripcion.trim(),
        peso_kg: pesoKg ? parseFloat(pesoKg) : null,
        estado: 'PENDIENTE_DE_ESCANEO',
        modalidad_pago: 'DESTINO',
      };
      if (valorDeclarado) insertPayload.valor_declarado = parseFloat(valorDeclarado);
      const { data, error } = await supabase
        .from('encomiendas').insert(insertPayload).select('id').single();
      if (error) throw error;
      router.replace({ pathname: '/encomiendas/enviar/[id]', params: { id: data.id } });
    } catch (err: any) {
      console.error('Error creando encomienda:', err.message);
      alert('Error creando encomienda: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header Stepper */}
      <View style={s.header}>
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => step > 1 ? setStep(step - 1) : router.back()}
            style={s.backBtn}
          >
            <CaretLeft weight="bold" color="#171717" size={22} />
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
            <View style={s.infoBox}>
              <Text className="text-sm text-muted-foreground leading-5">
                Las opciones de cooperativas aparecerán en taquilla basándose en estas rutas.
              </Text>
            </View>
          </View>
        )}

        {/* ─── Paso 2: Destinatario + Paquete ─── */}
        {step === 2 && (
          <View>
            <Text style={s.sectionLabel}>Datos de quien recibe</Text>

            <InputField
              placeholder="Nombre Completo"
              value={nombre}
              onChangeText={setNombre}
            />
            <InputField
              placeholder="Cédula de Identidad"
              keyboardType="number-pad"
              value={cedula}
              onChangeText={setCedula}
            />
            <InputField
              placeholder="Teléfono (Ej: +58 414...)"
              keyboardType="phone-pad"
              value={telefono}
              onChangeText={setTelefono}
              containerStyle={{ marginBottom: 24 }}
            />

            <Text style={s.sectionLabel}>Descripción del paquete</Text>
            <InputField
              placeholder="¿Qué contiene? (Ej: Documentos, ropa, electrónica...)"
              value={descripcion}
              onChangeText={setDescripcion}
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

            {/* Alert informativa */}
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
                <Text style={s.summaryCaption}>Destinatario</Text>
                <Text style={s.summaryValue}>{nombre}</Text>
                <Text style={s.summaryMeta}>C.I: {cedula} · Tel: {telefono}</Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 16, marginTop: 16 }}>
                <Text style={s.summaryCaption}>Paquete</Text>
                <Text style={s.summaryValue}>{descripcion}</Text>
                {pesoKg ? <Text style={s.summaryMeta}>Peso estimado: {pesoKg} kg</Text> : null}
                {valorDeclarado ? <Text style={s.summaryMeta}>Valor declarado: ${valorDeclarado}</Text> : null}
              </View>
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
