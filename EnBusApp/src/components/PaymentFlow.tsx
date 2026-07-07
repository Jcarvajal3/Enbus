import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { TextInput, Modal } from 'react-native';
import { CheckCircle, CreditCard, Bank, X } from 'phosphor-react-native';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';

// ─── Bancos de Venezuela ──────────────────────────────────────────────────────
const BANCOS_VE = [
  'Banco de Venezuela', 'Bancamiga', 'Banesco', 'BBVA Provincial',
  'Mercantil', 'BNC', 'Banco Exterior', 'Bicentenario',
  'Banco del Tesoro', 'Banco Agrícola de Venezuela',
  'Banco Nacional de Crédito (BNC)', 'Banplus',
  'Banco Venezolano de Crédito', 'Sofitasa', 'BOD',
  'Bancrecer', 'Mi Banco', 'Banco de la Fuerza Armada (BANFANB)',
  'Otras', 'Zelle', 'PayPal',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type FlowStep = 'metodos' | 'formulario' | 'enviado';

const METODO_INFO: Record<string, { label: string; desc: string }> = {
  PAGO_MOVIL: { label: 'Pago Móvil', desc: 'Transferencia instantánea en bolívares' },
  TRANSFERENCIA_BANCARIA: { label: 'Transferencia Bancaria', desc: 'Desde tu cuenta bancaria nacional' },
  ZELLE: { label: 'Zelle / Divisas', desc: 'Pago electrónico en dólares' },
  EFECTIVO: { label: 'Efectivo en Taquilla', desc: 'Pago directo en la taquilla de la cooperativa' },
};

interface PaymentFlowProps {
  monto: number;
  cooperativa_id?: string;
  concepto?: string;
  encomienda_id?: string;
  boleto_ids?: string[];
  onPaymentSuccess?: (pagoId?: string, pagoPayload?: Record<string, unknown>) => void;
}

export function PaymentFlow({
  monto,
  cooperativa_id,
  concepto,
  encomienda_id,
  boleto_ids,
  onPaymentSuccess,
}: PaymentFlowProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<FlowStep>('metodos');
  const [metodosCuentas, setMetodosCuentas] = useState<any[]>([]);
  const [loadingMetodos, setLoadingMetodos] = useState(true);
  const [metodoSeleccionado, setMetodoSeleccionado] = useState<any>(null);

  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [banco, setBanco] = useState('');
  const [isBancoModalVisible, setIsBancoModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pagoId, setPagoId] = useState<string | undefined>(undefined);
  const [currentPayload, setCurrentPayload] = useState<Record<string, unknown> | undefined>(undefined);

  const inputClass = 'bg-background border border-input px-4 h-12 rounded-[10px] text-base text-foreground';

  // ── Cargar métodos de pago reales de la cooperativa ─────────────────────────
  useEffect(() => {
    if (!cooperativa_id) {
      setLoadingMetodos(false);
      return;
    }
    let isMounted = true;
    const fetchMetodos = async () => {
      try {
        setLoadingMetodos(true);
        const { data, error } = await supabase
          .from('metodos_pago_cooperativa')
          .select('*')
          .eq('cooperativa_id', cooperativa_id)
          .eq('activo', true);

        if (error) throw error;
        if (isMounted) {
          setMetodosCuentas(data || []);
        }
      } catch (err: any) {
        console.error('[PaymentFlow] Error cargando métodos de pago:', err.message);
      } finally {
        if (isMounted) setLoadingMetodos(false);
      }
    };
    fetchMetodos();
    return () => { isMounted = false; };
  }, [cooperativa_id]);

  // Si no se han cargado métodos en BD, proveer Efectivo como fallback
  const metodosDisponibles = metodosCuentas.length > 0 
    ? metodosCuentas 
    : [{ id: 'fallback-efectivo', tipo: 'EFECTIVO', cooperativa_id }];

  const isEfectivo = metodoSeleccionado?.tipo === 'EFECTIVO';

  // Validate fecha format DD/MM/AAAA and that it represents a real date
  const isFechaValid = (() => {
    if (!fecha.trim()) return false;
    const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!DATE_REGEX.test(fecha.trim())) return false;
    const [day, month, year] = fecha.trim().split('/').map(Number);
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  })();

  const isFormValid = isEfectivo
    ? true
    : referencia.trim().length >= 4 && /^\d+$/.test(referencia.trim()) && isFechaValid && banco.trim().length > 0;

  const handleSubmitPago = async () => {
    if (!isFormValid || !metodoSeleccionado || !user) return;
    setIsSubmitting(true);

    try {
      // Formatear fecha de DD/MM/AAAA a YYYY-MM-DD
      let formattedDate: string | null = null;
      if (!isEfectivo) {
        const parts = fecha.trim().split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          formattedDate = `${year}-${month}-${day}`;
        } else {
          formattedDate = fecha.trim();
        }
      }

      const pagoPayload: Record<string, unknown> = {
        pagador_id: user.id,
        monto,
        tipo_pago: isEfectivo ? 'EFECTIVO' : 'DIGITAL',
        verificado: false,
      };

      if (cooperativa_id) pagoPayload.cooperativa_id = cooperativa_id;
      if (encomienda_id) pagoPayload.encomienda_id = encomienda_id;

      // Vincular método de pago real (salvo que sea fallback)
      if (metodoSeleccionado.id && metodoSeleccionado.id !== 'fallback-efectivo') {
        pagoPayload.metodo_pago_id = metodoSeleccionado.id;
      }

      if (!isEfectivo) {
        pagoPayload.numero_referencia = referencia.trim();
        pagoPayload.fecha_transaccion = formattedDate;
        pagoPayload.banco_emisor = banco;
      }

      setCurrentPayload(pagoPayload);

      // Si tenemos ID de encomienda o boletos ya creados, insertamos el pago directamente
      if (encomienda_id || (boleto_ids && boleto_ids.length > 0)) {
        const { data: pago, error: pagoError } = await supabase
          .from('pagos')
          .insert(pagoPayload)
          .select('id')
          .single();

        if (pagoError) throw pagoError;
        setPagoId(pago?.id);
      }

      setStep('enviado');
    } catch (err: any) {
      console.error('[PaymentFlow] Error al registrar pago:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo registrar el pago: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingMetodos) {
    return (
      <View className="bg-card rounded-[14px] p-8 border border-border items-center justify-center">
        <Spinner size="large" />
        <Text className="text-xs text-muted-foreground mt-2 font-bold">Cargando cuentas bancarias...</Text>
      </View>
    );
  }

  // Paso 3: Enviado
  if (step === 'enviado') {
    return (
      <View className="bg-card rounded-[14px] p-8 border border-border items-center">
        <View className="size-20 bg-success/20 rounded-full items-center justify-center mb-4">
          <CheckCircle weight="fill" color="#16a34a" size={40} />
        </View>
        <Text className="font-heading text-xl text-foreground text-center mb-2">Comprobante Enviado</Text>
        <Text className="text-sm text-muted-foreground text-center mb-6 leading-5">
          La cooperativa verificará tu pago. Una vez verificado por un taquillero, tu reserva/envío será confirmado.
        </Text>

        {!isEfectivo && referencia ? (
          <View className="bg-secondary rounded-[10px] px-4 py-3 w-full mb-6">
            <Text className="text-xs text-muted-foreground font-bold mb-1">Referencia registrada</Text>
            <Text className="text-sm font-black text-foreground">{referencia}</Text>
          </View>
        ) : null}

        {isEfectivo && (
          <View className="bg-warning/10 rounded-[10px] px-4 py-3 w-full mb-6 border border-warning/20">
            <Text className="text-xs text-warning font-bold mb-1">Pago en efectivo</Text>
            <Text className="text-sm text-foreground">Completa tu pago al presentarte en la taquilla de la cooperativa.</Text>
          </View>
        )}

        {onPaymentSuccess && (
          <Pressable
            onPress={() => onPaymentSuccess(pagoId, currentPayload)}
            className="bg-primary h-12 rounded-[10px] items-center justify-center w-full"
          >
            <Text className="text-primary-foreground font-bold">Continuar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Paso 2: Formulario de comprobante
  if (step === 'formulario') {
    const info = METODO_INFO[metodoSeleccionado?.tipo] || { label: 'Pago', desc: '' };
    return (
      <ScrollView className="bg-card rounded-[14px] p-6 border border-border">
        {/* Volver */}
        <Pressable onPress={() => setStep('metodos')} className="flex-row items-center mb-6 gap-2">
          <X color="#a3a3a3" size={16} weight="bold" />
          <Text className="text-sm text-muted-foreground">Volver a métodos</Text>
        </Pressable>

        <Text className="font-heading text-lg text-foreground mb-1">Confirmar Pago</Text>
        <Text className="text-sm text-muted-foreground mb-4">
          Método: {info.label}
        </Text>

        {/* Monto */}
        <View className="bg-primary/10 rounded-[10px] px-4 py-3 mb-4 border border-primary/20 items-center">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Monto a pagar</Text>
          <Text className="font-heading text-3xl text-primary">{monto} Bs.</Text>
          {concepto && <Text className="text-xs text-muted-foreground mt-1 text-center">{concepto}</Text>}
        </View>

        {/* Datos reales de la Cooperativa */}
        {!isEfectivo && (
          <View className="bg-secondary rounded-[10px] p-4 mb-6 border border-border/50">
            <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Datos de Cuenta
            </Text>
            {metodoSeleccionado.tipo === 'PAGO_MOVIL' && (
              <View className="gap-1.5">
                {metodoSeleccionado.banco && <Text className="text-sm text-foreground"><Text className="font-bold">Banco:</Text> {metodoSeleccionado.banco}</Text>}
                <Text className="text-sm text-foreground"><Text className="font-bold">Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.numero_cuenta && <Text className="text-sm text-foreground"><Text className="font-bold">Teléfono PM:</Text> {metodoSeleccionado.numero_cuenta}</Text>}
                {metodoSeleccionado.cedula_rif && <Text className="text-sm text-foreground"><Text className="font-bold">C.I. / RIF:</Text> {metodoSeleccionado.cedula_rif}</Text>}
              </View>
            )}
            {metodoSeleccionado.tipo === 'TRANSFERENCIA_BANCARIA' && (
              <View className="gap-1.5">
                {metodoSeleccionado.banco && <Text className="text-sm text-foreground"><Text className="font-bold">Banco:</Text> {metodoSeleccionado.banco}</Text>}
                <Text className="text-sm text-foreground"><Text className="font-bold">Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.numero_cuenta && <Text className="text-sm text-foreground"><Text className="font-bold">Nro. Cuenta:</Text> {metodoSeleccionado.numero_cuenta}</Text>}
                {metodoSeleccionado.cedula_rif && <Text className="text-sm text-foreground"><Text className="font-bold">C.I. / RIF:</Text> {metodoSeleccionado.cedula_rif}</Text>}
              </View>
            )}
            {metodoSeleccionado.tipo === 'ZELLE' && (
              <View className="gap-1.5">
                <Text className="text-sm text-foreground"><Text className="font-bold">Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.email_zelle && <Text className="text-sm text-foreground"><Text className="font-bold">Correo Zelle:</Text> {metodoSeleccionado.email_zelle}</Text>}
              </View>
            )}
            {metodoSeleccionado.instrucciones && (
              <Text className="text-xs text-muted-foreground mt-2 italic border-t border-border/30 pt-2">
                Nota: {metodoSeleccionado.instrucciones}
              </Text>
            )}
          </View>
        )}

        {/* Form Fields */}
        {isEfectivo ? (
          <View className="bg-warning/10 border border-warning/30 rounded-[10px] p-4 mb-6">
            <Text className="text-sm text-foreground font-bold mb-1">Pago en Taquilla</Text>
            <Text className="text-sm text-muted-foreground leading-5">
              Al seleccionar esta opción, tu reserva quedará pendiente.
              Deberás realizar el pago directamente en la ventanilla de la cooperativa.
            </Text>
          </View>
        ) : (
          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-foreground mb-2">Número de Referencia</Text>
              <TextInput
                className={inputClass}
                placeholder="Últimos 4 o más dígitos"
                placeholderTextColor="#a3a3a3"
                keyboardType="number-pad"
                value={referencia}
                onChangeText={setReferencia}
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-foreground mb-2">Fecha de Transacción</Text>
              <TextInput
                className={inputClass}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="#a3a3a3"
                keyboardType="number-pad"
                value={fecha}
                onChangeText={setFecha}
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-foreground mb-2">Banco Emisor (Tu banco)</Text>
              <Pressable
                onPress={() => setIsBancoModalVisible(true)}
                className="bg-background border border-input h-12 rounded-[10px] px-4 flex-row justify-between items-center"
              >
                <Text className={banco ? 'text-base text-foreground' : 'text-base text-muted-foreground'}>
                  {banco || 'Seleccionar banco...'}
                </Text>
                <Bank color="#a3a3a3" size={20} weight="bold" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmitPago}
          disabled={!isFormValid || isSubmitting}
          className={`h-12 rounded-[10px] items-center justify-center mt-6 mb-8 ${isFormValid ? 'bg-primary' : 'bg-primary/40'}`}
        >
          {isSubmitting
            ? <Spinner />
            : <Text className={`font-bold ${isFormValid ? 'text-primary-foreground' : 'text-primary-foreground/50'}`}>
                {isEfectivo ? 'Confirmar Pago en Taquilla' : 'Registrar Pago'}
              </Text>
          }
        </Pressable>

        {/* Modal de selección de banco */}
        <Modal
          visible={isBancoModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsBancoModalVisible(false)}
        >
          <View className="flex-1 bg-background pt-6">
            <View className="flex-row justify-between items-center px-6 pb-4 border-b border-border">
              <Text className="text-xl font-heading text-foreground">Banco Emisor</Text>
              <Pressable
                onPress={() => setIsBancoModalVisible(false)}
                className="size-10 bg-secondary rounded-full items-center justify-center"
              >
                <X color="#171717" weight="bold" size={20} />
              </Pressable>
            </View>
            <ScrollView className="flex-1 px-6">
              {BANCOS_VE.map((b, i) => (
                <Pressable
                  key={b}
                  onPress={() => { setBanco(b); setIsBancoModalVisible(false); }}
                  className={`py-4 flex-row items-center ${i !== BANCOS_VE.length - 1 ? 'border-b border-border/30' : ''}`}
                >
                  <View className="size-10 bg-primary/10 rounded-full items-center justify-center">
                    <Bank color="#d4a017" weight="fill" size={20} />
                  </View>
                  <Text className="text-base font-bold text-foreground ml-4">{b}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // Paso 1: Selección de método
  return (
    <View className="bg-card rounded-[14px] p-6 border border-border">
      <Text className="font-heading text-lg text-foreground mb-1">Método de Pago</Text>
      {concepto && <Text className="text-sm text-muted-foreground mb-4">{concepto}</Text>}

      <View className="bg-primary/10 rounded-[10px] px-4 py-3 mb-6 border border-primary/20 items-center">
        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total a Transferir</Text>
        <Text className="font-heading text-3xl text-primary">{monto} Bs.</Text>
      </View>

      <View className="gap-3">
        {metodosDisponibles.map((m) => {
          const info = METODO_INFO[m.tipo] || { label: m.tipo, desc: 'Cuenta de la cooperativa' };
          return (
            <Pressable
              key={m.id}
              onPress={() => { setMetodoSeleccionado(m); setStep('formulario'); }}
              className="flex-row items-center p-4 bg-background border border-border rounded-[10px]"
            >
              <View className="size-10 bg-primary/10 rounded-full items-center justify-center mr-4">
                <CreditCard color="#d4a017" weight="fill" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-foreground">{info.label}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>{m.banco ? `${m.banco} - ` : ''}{info.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
