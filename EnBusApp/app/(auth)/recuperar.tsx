import { SafeAreaView, View, Text } from '@/tw';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { Spinner } from '@/src/components/Spinner';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import * as Linking from 'expo-linking';
import { PressableScale } from '@/src/components/PressableScale';
import { Colors, Typography, Radius, Shadows } from '@/src/theme';

export default function RecuperarPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const foregroundColor = Colors.foreground;

  async function handleResetPassword() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!email.trim()) {
      toast.show('error', 'Por favor ingresa tu correo electrónico');
      return;
    }
    try {
      setLoading(true);
      const redirectTo = Linking.createURL('recuperar');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
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
    <SafeAreaView style={{ backgroundColor: Colors.background }} className="flex-1">
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <PressableScale
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderRadius: Radius.full }}
        >
          <ArrowLeft weight="bold" color={foregroundColor} size={22} />
        </PressableScale>
        <Text
          style={{
            fontFamily: Typography.family,
            fontWeight: Typography.weights.bold,
            color: Colors.foreground,
          }}
          className="text-xl"
        >
          Recuperar Contraseña
        </Text>
      </View>

      <View className="flex-1 justify-center px-6 pb-20">
        <View
          style={{
            backgroundColor: Colors.surface,
            borderRadius: Radius.xl,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontFamily: Typography.family,
              fontWeight: Typography.weights.regular,
              color: Colors.mutedForeground,
            }}
            className="text-sm mb-6 leading-5"
          >
            Ingresa el correo electrónico asociado a tu cuenta de EnBus. Te enviaremos un enlace
            para que puedas restablecer tu contraseña.
          </Text>

          <View className="mb-6">
            <Text
              style={{
                fontFamily: Typography.family,
                fontWeight: Typography.weights.semibold,
                color: Colors.foreground,
              }}
              className="text-[13px] mb-1.5 ml-0.5"
            >
              Correo Electrónico
            </Text>
            <TextInput
              placeholder="tu@correo.com"
              placeholderTextColor={Colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              style={{
                height: 48,
                borderRadius: Radius.full,
                backgroundColor: Colors.white,
                paddingHorizontal: 20,
                fontSize: 15,
                color: Colors.foreground,
                fontFamily: Typography.family,
                borderWidth: 0,
              }}
            />
          </View>

          <PressableScale
            onPress={handleResetPassword}
            disabled={loading}
            haptic
            hapticType="medium"
            style={{
              height: 52,
              borderRadius: Radius.full,
              backgroundColor: Colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? (
              <Spinner />
            ) : (
              <Text
                style={{
                  fontFamily: Typography.family,
                  fontWeight: Typography.weights.bold,
                  color: Colors.accentForeground,
                }}
                className="text-[16px]"
              >
                Enviar Enlace
              </Text>
            )}
          </PressableScale>
        </View>
      </View>
    </SafeAreaView>
  );
}
