/**
 * CompletarPerfilSheet – pide nombre, cédula y teléfono antes de la primera
 * compra o el primer envío (#24, M-06). Se abre cuando `usePerfil().completo`
 * es `false`; al guardar llama a `onCompletado(perfil)` y la pantalla sigue con
 * lo que el usuario quería hacer.
 *
 *   <CompletarPerfilSheet
 *     visible={pedirDatos}
 *     motivo="compra"
 *     onClose={() => setPedirDatos(false)}
 *     onCompletado={() => { setPedirDatos(false); apartarAsientos(); }}
 *   />
 */

import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { WhatsappLogo } from 'phosphor-react-native';
import { BottomSheet, Button, Field, Text } from '@/src/components/ui';
import { usePerfil } from '@/src/hooks/usePerfil';
import { humanizeError } from '@/src/utils/errores';
import { SOPORTE_WHATSAPP, abrirSoporteWhatsApp } from '@/src/utils/soporte';
import {
  MENSAJE_CEDULA,
  MENSAJE_TELEFONO,
  cedulaValida,
  nombreValido,
  telefonoValido,
} from '@/src/utils/validation';
import type { PerfilUsuario } from '@/src/types';
import { Colors, Layout, Radius, Spacing } from '@/src/theme';

export type MotivoCompletarPerfil = 'compra' | 'envio' | 'perfil';

interface CompletarPerfilSheetProps {
  visible: boolean;
  motivo: MotivoCompletarPerfil;
  onClose: () => void;
  onCompletado: (perfil: PerfilUsuario) => void;
}

const INTRO: Record<MotivoCompletarPerfil, string> = {
  compra:
    'Para emitir tus boletos necesitamos tu cédula y tu teléfono. Solo te lo pedimos una vez.',
  envio:
    'Para registrar tu envío necesitamos tu cédula y tu teléfono. Solo te lo pedimos una vez.',
  perfil:
    'Con tu cédula y tu teléfono podrás comprar boletos y recibir encomiendas a tu nombre.',
};

type Errores = Partial<Record<'nombre' | 'cedula' | 'telefono', string>>;

export function CompletarPerfilSheet({
  visible,
  motivo,
  onClose,
  onCompletado,
}: CompletarPerfilSheetProps) {
  const { perfil, guardar } = usePerfil();

  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cedulaRef = useRef<TextInput>(null);
  const telefonoRef = useRef<TextInput>(null);

  // Al abrir, prellenar con lo que ya tiene el perfil (sin los marcadores
  // PENDIENTE-…). Si el perfil llega con la hoja ya abierta, solo se rellenan los
  // campos vacíos: nunca se pisa lo que la persona está escribiendo.
  const abiertaRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      abiertaRef.current = false;
      return;
    }
    if (!abiertaRef.current) {
      abiertaRef.current = true;
      setNombre(nombreValido(perfil?.nombre_completo) ? (perfil?.nombre_completo ?? '') : '');
      setCedula(perfil?.cedula_rif ?? '');
      setTelefono(perfil?.telefono ?? '');
      setErrores({});
      setErrorGeneral(null);
      return;
    }
    if (!perfil) return;
    setNombre((v) => v || (nombreValido(perfil.nombre_completo) ? (perfil.nombre_completo ?? '') : ''));
    setCedula((v) => v || perfil.cedula_rif || '');
    setTelefono((v) => v || perfil.telefono || '');
  }, [visible, perfil]);

  const limpiarError = (campo: keyof Errores) => {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    setErrorGeneral(null);
  };

  const validar = (): boolean => {
    const next: Errores = {};
    if (!nombreValido(nombre)) next.nombre = 'Escribe tu nombre y apellido.';
    if (!cedulaValida(cedula)) next.cedula = MENSAJE_CEDULA;
    if (!telefonoValido(telefono)) next.telefono = MENSAJE_TELEFONO;
    setErrores(next);
    return Object.keys(next).length === 0;
  };

  async function handleGuardar() {
    if (guardando) return;
    if (!validar()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const guardado = await guardar({ nombre_completo: nombre, cedula_rif: cedula, telefono });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCompletado(guardado);
    } catch (err) {
      if (__DEV__) console.warn('[CompletarPerfilSheet] guardar:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorGeneral(humanizeError(err, 'perfil'));
    } finally {
      setGuardando(false);
    }
  }

  const sugiereSoporte = !!errorGeneral && errorGeneral.includes('WhatsApp') && !!SOPORTE_WHATSAPP;

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!guardando) onClose();
      }}
      title="Completa tus datos"
      footer={
        <Button variant="accent" fullWidth loading={guardando} onPress={handleGuardar}>
          Guardar y continuar
        </Button>
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="secondary" color="muted" style={s.intro}>
            {INTRO[motivo]}
          </Text>

          <Field
            label="Nombre y apellido"
            placeholder="Ana Pérez"
            value={nombre}
            onChangeText={(v) => {
              setNombre(v);
              limpiarError('nombre');
            }}
            error={errores.nombre}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => cedulaRef.current?.focus()}
            editable={!guardando}
          />

          <Field
            ref={cedulaRef}
            label="Cédula"
            placeholder="V-12345678"
            value={cedula}
            onChangeText={(v) => {
              setCedula(v);
              limpiarError('cedula');
            }}
            error={errores.cedula}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => telefonoRef.current?.focus()}
            editable={!guardando}
          />

          <Field
            ref={telefonoRef}
            label="Teléfono"
            placeholder="0414-1234567"
            value={telefono}
            onChangeText={(v) => {
              setTelefono(v);
              limpiarError('telefono');
            }}
            error={errores.telefono}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            onSubmitEditing={handleGuardar}
            editable={!guardando}
          />

          {errorGeneral ? (
            <View style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text variant="secondary" color="dangerText">
                {errorGeneral}
              </Text>
              {sugiereSoporte ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={WhatsappLogo}
                  onPress={() => abrirSoporteWhatsApp('Mi cédula o mi teléfono ya está en otra cuenta.')}
                  style={s.errorAccion}
                >
                  Escribir por WhatsApp
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  intro: {
    marginBottom: Spacing.xl,
  },
  error: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.destructiveSoft,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
  },
  errorAccion: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
});
