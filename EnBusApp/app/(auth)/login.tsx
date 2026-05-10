import { SafeAreaView } from '@/tw';
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { TextInput, StyleSheet, Alert } from 'react-native';
import { supabase } from '@/src/utils/supabase';
import { Spinner } from '@/src/components/Spinner';

type Mode = 'login' | 'register';

// ──────────────────────────────────────────────
// Maia Neutral palette — hardcoded for RN
// ──────────────────────────────────────────────
const C = {
  bg: '#ffffff',
  card: '#ffffff',
  boarder: '#d4d4d8',     // Zinc-300 — visible across screens
  secondary: '#f4f4f5',  // Zinc-100
  primary: '#e2b714',
  primaryFg: '#6b4a1a',
  foreground: '#171717',
  muted: '#737373',
  placeholder: '#a1a1aa',
  radius: 10,
  cardRadius: 14,
};

function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={C.placeholder}
        style={s.input}
        {...props}
      />
    </View>
  );
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    nombre_completo: '', telefono: '', cedula_rif: ''
  });
  const [loading, setLoading] = useState(false);
  const update = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit() {
    if (mode === 'login') {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) Alert.alert('Error al entrar', error.message);
      setLoading(false);
    } else {
      if (!form.nombre_completo || !form.telefono || !form.cedula_rif || !form.email || !form.password) {
        Alert.alert('Error', 'Todos los campos son obligatorios'); return;
      }
      if (form.password !== form.confirmPassword) {
        Alert.alert('Error', 'Las contraseñas no coinciden'); return;
      }
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { nombre_completo: form.nombre_completo, telefono: form.telefono, cedula_rif: form.cedula_rif } }
      });
      if (error) Alert.alert('Error al registrar', error.message);
      else if (data.session) Alert.alert('Éxito', 'Cuenta creada e iniciada automáticamente');
      else Alert.alert('Revise su correo', 'Se ha enviado un enlace de confirmación');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-12">

        {/* Logo */}
        <View style={s.logoArea}>
          <View style={s.logoBox}>
            <Text style={s.logoText}>EB</Text>
          </View>
          <Text className="text-3xl font-heading text-foreground">EnBus App</Text>
          <Text className="text-base text-muted-foreground mt-1 text-center">
            Rastreo y Compra de Boletos
          </Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {/* Segmented Control */}
          <View style={s.segmented}>
            <Pressable onPress={() => setMode('login')} style={[s.segment, mode === 'login' && s.segmentActive]}>
              <Text style={[s.segmentText, mode === 'login' && s.segmentTextActive]}>Iniciar Sesión</Text>
            </Pressable>
            <Pressable onPress={() => setMode('register')} style={[s.segment, mode === 'register' && s.segmentActive]}>
              <Text style={[s.segmentText, mode === 'register' && s.segmentTextActive]}>Registrarse</Text>
            </Pressable>
          </View>

          {mode === 'register' && (
            <>
              <Field label="Nombre Completo" placeholder="Juan Pérez" value={form.nombre_completo} onChangeText={v => update('nombre_completo', v)} />
              <Field label="Teléfono" placeholder="04141234567" keyboardType="phone-pad" value={form.telefono} onChangeText={v => update('telefono', v)} />
              <Field label="Cédula o RIF" placeholder="V-12345678" value={form.cedula_rif} onChangeText={v => update('cedula_rif', v)} />
            </>
          )}

          <Field label="Correo Electrónico" placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => update('email', v)} />
          <Field label="Contraseña" placeholder="••••••••" secureTextEntry autoCapitalize="none" value={form.password} onChangeText={v => update('password', v)} />

          {mode === 'register' && (
            <Field label="Confirmar Contraseña" placeholder="••••••••" secureTextEntry autoCapitalize="none" value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} />
          )}

          {/* CTA Button */}
          <Pressable style={[s.cta, loading && s.ctaLoading]} onPress={handleSubmit} disabled={loading}>
            {loading ? <Spinner /> : <Text style={s.ctaText}>{mode === 'login' ? 'Entrar' : 'Crear Cuenta'}</Text>}
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: '#fdf5d3',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: '700', color: C.primary },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.boarder,
    borderRadius: C.cardRadius,
    padding: 20,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: C.secondary,
    borderRadius: C.radius,
    padding: 4,
    marginBottom: 20,
  },
  segment: {
    flex: 1, paddingVertical: 10,
    borderRadius: 8, alignItems: 'center',
  },
  segmentActive: { backgroundColor: C.bg },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.muted },
  segmentTextActive: { color: C.primary },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 13, fontWeight: '600',
    color: C.foreground, marginBottom: 6, marginLeft: 2,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: C.boarder,
    borderRadius: C.radius,
    backgroundColor: C.bg,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.foreground,
  },
  cta: {
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  ctaLoading: { opacity: 0.6 },
  ctaText: { fontSize: 16, fontWeight: '700', color: C.primaryFg },
});
