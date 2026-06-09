import { SafeAreaView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/utils/supabase';
import { Spinner } from '@/src/components/Spinner';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { GoogleLogo } from 'phosphor-react-native';
import * as Linking from 'expo-linking';

type Mode = 'login' | 'register';

function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View className="mb-3.5">
      <Text className="text-[13px] font-semibold text-foreground mb-1.5 ml-0.5">{label}</Text>
      <TextInput
        placeholderTextColor="#a1a1aa"
        className="h-12 border border-input rounded-[10px] bg-background px-3.5 text-[15px] text-foreground"
        {...props}
      />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    nombre_completo: '', telefono: '', cedula_rif: ''
  });
  const [loading, setLoading] = useState(false);
  const update = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Ícono y elementos que no soportan className directamente
  const primaryColor = useCSSVariable('--primary') as string || '#e2b714';

  async function handleSubmit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === 'login') {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) {
        toast.show('error', error.message);
      } else {
        toast.show('success', 'Sesión iniciada con éxito');
      }
      setLoading(false);
    } else {
      if (!form.nombre_completo || !form.telefono || !form.cedula_rif || !form.email || !form.password) {
        toast.show('error', 'Todos los campos son obligatorios');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.show('error', 'Las contraseñas no coinciden');
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { nombre_completo: form.nombre_completo, telefono: form.telefono, cedula_rif: form.cedula_rif } }
      });
      if (error) {
        toast.show('error', error.message);
      } else if (data.session) {
        toast.show('success', 'Cuenta creada e iniciada automáticamente');
      } else {
        toast.show('success', 'Se ha enviado un enlace de confirmación a su correo');
      }
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setLoading(true);
      toast.show('info', 'Iniciando sesión con Google...');
      
      const redirectUrl = Linking.createURL('/(tabs)');
      
      // Estructura OAuth Supabase para Google lista para producción.
      // Cuando se disponga de las credenciales de Google Cloud,
      // esto redirigirá automáticamente a la pantalla de consentimiento de Google y retornará a la app.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('Google Sign-In Error:', err.message);
      toast.show('error', 'Error al conectar con Google: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6 py-12">

        {/* Logo */}
        <View className="items-center mb-8">
          <View className="size-[72px] rounded-2xl bg-primary/10 items-center justify-center mb-3">
            <Text className="text-[28px] font-bold text-primary">EB</Text>
          </View>
          <Text className="font-heading text-3xl text-foreground">EnBus App</Text>
          <Text className="text-base text-muted-foreground mt-1 text-center">
            Rastreo y Compra de Boletos
          </Text>
        </View>

        {/* Card */}
        <View className="bg-card border border-border rounded-[14px] p-5">

          {/* Segmented Control */}
          <View className="flex-row bg-secondary rounded-[10px] p-1 mb-5">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setMode('login');
              }}
              className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'login' ? 'bg-background' : ''}`}
            >
              <Text className={`text-sm font-semibold ${mode === 'login' ? 'text-primary' : 'text-muted-foreground'}`}>
                Iniciar Sesión
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setMode('register');
              }}
              className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'register' ? 'bg-background' : ''}`}
            >
              <Text className={`text-sm font-semibold ${mode === 'register' ? 'text-primary' : 'text-muted-foreground'}`}>
                Registrarse
              </Text>
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

          {mode === 'login' && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/(auth)/recuperar' as any);
              }}
              className="mt-1 mb-4"
              style={{ alignSelf: 'flex-end' }}
            >
              <Text className="text-sm font-semibold text-primary">¿Olvidaste tu contraseña?</Text>
            </Pressable>
          )}

          {/* CTA */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            className={`h-[52px] rounded-full items-center justify-center mt-2 bg-primary ${loading ? 'opacity-60' : ''}`}
          >
            {loading
              ? <Spinner />
              : <Text className="text-[16px] font-bold text-primary-foreground">
                  {mode === 'login' ? 'Entrar' : 'Crear Cuenta'}
                </Text>
            }
          </Pressable>

          {/* Divider */}
          <View className="flex-row items-center my-4">
            <View className="flex-1 h-[1px] bg-border" />
            <Text className="mx-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider">O continuar con</Text>
            <View className="flex-1 h-[1px] bg-border" />
          </View>

          {/* Google Sign In Button */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={loading}
            className="h-[52px] rounded-full items-center justify-center border border-border bg-card flex-row gap-3 active:bg-secondary/40"
          >
            <GoogleLogo size={20} color="#171717" weight="bold" />
            <Text className="text-[15px] font-bold text-foreground">Google</Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}
