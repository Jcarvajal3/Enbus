import { SafeAreaView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { Spinner } from '@/src/components/Spinner';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import * as Linking from 'expo-linking';

export default function RecuperarPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const primaryColor = useCSSVariable('--primary') as string || '#e2b714';
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  async function handleResetPassword() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!email.trim()) {
      toast.show('error', 'Por favor ingresa tu correo electrónico');
      return;
    }

    try {
      setLoading(true);
      // Usar Linking.createURL para generar el deep-link correcto según el
      // scheme registrado en app.json ('enbus://') — tanto en dev como en producción.
      const redirectTo = Linking.createURL('recuperar');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) throw error;

      toast.show('success', 'Se ha enviado un enlace para restablecer tu contraseña.');
      router.back();
    } catch (err: any) {
      console.error('Error reset password:', err.message);
      toast.show('error', err.message || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-4 flex-row items-center border-b border-border gap-4">
        <Pressable
          onPress={() => router.back()}
          className="size-10 bg-secondary rounded-full items-center justify-center"
        >
          <CaretLeft weight="bold" color={foregroundColor} size={22} />
        </Pressable>
        <Text className="font-heading text-xl text-foreground">Recuperar Contraseña</Text>
      </View>

      <View className="flex-1 justify-center px-6 pb-20">
        <View className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
          <Text className="text-sm text-muted-foreground mb-6 leading-5">
            Ingresa el correo electrónico asociado a tu cuenta de EnBus. Te enviaremos un enlace para que puedas restablecer tu contraseña.
          </Text>

          <View className="mb-6">
            <Text className="text-[13px] font-semibold text-foreground mb-1.5 ml-0.5">Correo Electrónico</Text>
            <TextInput
              placeholder="tu@correo.com"
              placeholderTextColor="#a1a1aa"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              className="h-12 border border-input rounded-[10px] bg-background px-3.5 text-[15px] text-foreground"
            />
          </View>

          <Pressable
            onPress={handleResetPassword}
            disabled={loading}
            className={`h-[52px] rounded-full items-center justify-center bg-primary ${loading ? 'opacity-60' : ''}`}
          >
            {loading ? (
              <Spinner />
            ) : (
              <Text className="text-[16px] font-bold text-primary-foreground">
                Enviar Enlace
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
