import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from '@/tw';
import { Modal } from 'react-native';
import { CheckCircle, CreditCard, Bank, CalendarBlank, X } from 'phosphor-react-native';
import { Spinner } from '@/src/components/Spinner';

// Lista de bancos de Venezuela
const BANCOS_VE = [
  'Banco de Venezuela', 'Bancamiga', 'Banesco', 'BBVA Provincial',
  'Mercantil', 'BNC', 'Banco Exterior', 'Bicentenario',
  'Banco del Tesoro', 'Banco Agrícola de Venezuela',
  'Banco Nacional de Crédito (BNC)', 'Banplus',
  'Banco Venezolano de Crédito', 'Sofitasa', 'BOD',
  'Bancrecer', 'Mi Banco', 'Banco de la Fuerza Armada (BANFANB)',
  'Otras', 'Zelle', 'PayPal',
];

type FlowStep = 'metodos' | 'formulario' | 'enviado';
type MetodoPago = 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'EFECTIVO' | 'ZELLE';

interface PaymentFlowProps {
  monto: number;
  cooperativa_id?: string;
  concepto?: string;
  onPaymentSuccess?: () => void;
}

export function PaymentFlow({ monto, concepto, onPaymentSuccess }: PaymentFlowProps) {
  const [step, setStep] = useState<FlowStep>('metodos');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [banco, setBanco] = useState('');
  const [isBancoModalVisible, setIsBancoModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputClass = 'bg-background border border-input px-4 h-12 rounded-[10px] text-base text-foreground';

  const metodos: { id: MetodoPago; label: string; desc: string }[] = [
    { id: 'PAGO_MOVIL', label: 'Pago Móvil', desc: 'Transferencia instantánea entre bancos' },
    { id: 'TRANSFERENCIA', label: 'Transferencia Bancaria', desc: 'Desde tu cuenta a la de la cooperativa' },
    { id: 'ZELLE', label: 'Zelle / PayPal', desc: 'Pagos en divisas' },
    { id: 'EFECTIVO', label: 'Efectivo en Taquilla', desc: 'Pagas al entregar el paquete' },
  ];

  const handleSubmitPago = async () => {
    if (!referencia.trim() || !fecha.trim() || !banco.trim()) return;
    setIsSubmitting(true);
    // Simulamos la llamada al backend. En producción: supabase.from('pagos').insert(...)
    await new Promise(r => setTimeout(r, 1200));
    setIsSubmitting(false);
    setStep('enviado');
  };

  const isFormValid = referencia.trim().length >= 4 && fecha.trim().length >= 6 && banco.trim().length > 0;

  if (step === 'enviado') {
    return (
      <View className="bg-card rounded-[14px] p-8 border border-border items-center">
        <View className="size-20 bg-success/20 rounded-full items-center justify-center mb-4">
          <CheckCircle weight="fill" color="#16a34a" size={40} />
        </View>
        <Text className="font-heading text-xl text-foreground text-center mb-2">Pago Enviado</Text>
        <Text className="text-sm text-muted-foreground text-center mb-6 leading-5">
          La cooperativa verificará tu pago. Cuando sea confirmado, tu transacción será procesada.
        </Text>
        <View className="bg-secondary rounded-[10px] px-4 py-3 w-full mb-6">
          <Text className="text-xs text-muted-foreground font-bold mb-1">Referencia</Text>
          <Text className="text-sm font-black text-foreground">{referencia}</Text>
        </View>
        {onPaymentSuccess && (
          <Pressable
            onPress={onPaymentSuccess}
            className="bg-primary h-12 rounded-[10px] items-center justify-center w-full"
          >
            <Text className="text-primary-foreground font-bold">Continuar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (step === 'formulario') {
    return (
      <View className="bg-card rounded-[14px] p-6 border border-border">
        {/* Encabezado */}
        <Pressable onPress={() => setStep('metodos')} className="flex-row items-center mb-6 gap-2">
          <X color="#a3a3a3" size={16} weight="bold" />
          <Text className="text-sm text-muted-foreground">Volver</Text>
        </Pressable>

        <Text className="font-heading text-lg text-foreground mb-1">Confirmar Pago</Text>
        <Text className="text-sm text-muted-foreground mb-6">Método: {metodos.find(m => m.id === metodo)?.label}</Text>

        {/* Monto */}
        <View className="bg-primary/10 rounded-[10px] px-4 py-3 mb-6 border border-primary/20 items-center">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Monto a pagar</Text>
          <Text className="font-heading text-3xl text-primary">{monto} Bs.</Text>
          {concepto && <Text className="text-xs text-muted-foreground mt-1">{concepto}</Text>}
        </View>

        {/* Formulario */}
        <View className="gap-4">
          {/* Número de referencia */}
          <View>
            <Text className="text-sm font-medium text-foreground mb-2">Número de Referencia</Text>
            <TextInput
              className={inputClass}
              placeholder="Ej: 0000123456789"
              placeholderTextColor="#a3a3a3"
              keyboardType="number-pad"
              value={referencia}
              onChangeText={setReferencia}
            />
          </View>

          {/* Fecha */}
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

          {/* Banco Emisor */}
          <View>
            <Text className="text-sm font-medium text-foreground mb-2">Banco Emisor</Text>
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

        {/* Botón */}
        <Pressable
          onPress={handleSubmitPago}
          disabled={!isFormValid || isSubmitting}
          className={`h-12 rounded-[10px] items-center justify-center mt-6 ${isFormValid ? 'bg-primary' : 'bg-primary/40'}`}
        >
          {isSubmitting ? <Spinner /> : (
            <Text className={`font-bold ${isFormValid ? 'text-primary-foreground' : 'text-primary-foreground/50'}`}>
              Enviar Comprobante
            </Text>
          )}
        </Pressable>

        {/* Modal Banco */}
        <Modal visible={isBancoModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsBancoModalVisible(false)}>
          <View className="flex-1 bg-background pt-6">
            <View className="flex-row justify-between items-center px-6 pb-4 border-b border-border">
              <Text className="text-xl font-heading text-foreground">Banco Emisor</Text>
              <Pressable onPress={() => setIsBancoModalVisible(false)} className="size-10 bg-secondary rounded-full items-center justify-center">
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
      </View>
    );
  }

  // Paso 1: Selección de método de pago
  return (
    <View className="bg-card rounded-[14px] p-6 border border-border">
      <Text className="font-heading text-lg text-foreground mb-1">Método de Pago</Text>
      {concepto && <Text className="text-sm text-muted-foreground mb-4">{concepto}</Text>}

      <View className="bg-primary/10 rounded-[10px] px-4 py-3 mb-6 border border-primary/20 items-center">
        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total</Text>
        <Text className="font-heading text-3xl text-primary">{monto} Bs.</Text>
      </View>

      <View className="gap-3">
        {metodos.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => { setMetodo(m.id); setStep('formulario'); }}
            className="flex-row items-center p-4 bg-background border border-border rounded-[10px]"
          >
            <View className="size-10 bg-primary/10 rounded-full items-center justify-center mr-4">
              <CreditCard color="#d4a017" weight="fill" size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-foreground">{m.label}</Text>
              <Text className="text-xs text-muted-foreground">{m.desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
