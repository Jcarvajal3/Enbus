import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { TextInput, Modal, Alert } from 'react-native';
import { CheckCircle, CreditCard, Bank, X } from 'phosphor-react-native';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';

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
type MetodoPago = 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'EFECTIVO' | 'ZELLE';

// Mapeo al tipo_pago esperado por la tabla `pagos` del Panel
const TIPO_PAGO_MAP: Record<MetodoPago, 'DIGITAL' | 'EFECTIVO'> = {
  PAGO_MOVIL: 'DIGITAL',
  TRANSFERENCIA: 'DIGITAL',
  ZELLE: 'DIGITAL',
  EFECTIVO: 'EFECTIVO',
};

interface PaymentFlowProps {
  monto: number;
  cooperativa_id?: string;
  concepto?: string;
  /** UUID de la encomienda a vincular con el pago (opcional) */
  encomienda_id?: string;
  /** UUID(s) de boleto(s) a vincular con el pago (opcional) */
  boleto_ids?: string[];
  onPaymentSuccess?: (pagoId?: string, pagoPayload?: Record<string, unknown>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentFlow({
  monto,
  cooperativa_id,
  concepto,
  encomienda_id,
  boleto_ids,
  onPaymentSuccess,
}: PaymentFlowProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<FlowStep>('metodos');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [banco, setBanco] = useState('');
  const [isBancoModalVisible, setIsBancoModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pagoId, setPagoId] = useState<string | undefined>(undefined);
  const [currentPayload, setCurrentPayload] = useState<Record<string, unknown> | undefined>(undefined);

  const inputClass = 'bg-background border border-input px-4 h-12 rounded-[10px] text-base text-foreground';

  const metodos: { id: MetodoPago; label: string; desc: string }[] = [
    { id: 'PAGO_MOVIL', label: 'Pago Móvil', desc: 'Transferencia instantánea entre bancos' },
    { id: 'TRANSFERENCIA', label: 'Transferencia Bancaria', desc: 'Desde tu cuenta a la de la cooperativa' },
    { id: 'ZELLE', label: 'Zelle / PayPal', desc: 'Pagos en divisas' },
    { id: 'EFECTIVO', label: 'Efectivo en Taquilla', desc: 'Pagas al entregar el paquete' },
  ];

  // ── Validación ─────────────────────────────────────────────────────────────
  // El efectivo no requiere referencia/banco/fecha — solo confirmación
  const isEfectivo = metodo === 'EFECTIVO';
  const isFormValid = isEfectivo
    ? true
    : referencia.trim().length >= 4 && fecha.trim().length >= 6 && banco.trim().length > 0;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmitPago = async () => {
    if (!isFormValid || !metodo || !user) return;
    setIsSubmitting(true);

    try {
      // ── Construir el registro de pago (alineado al esquema real de `pagos`) ─
      const pagoPayload: Record<string, unknown> = {
        pagador_id: user.id,
        monto,
        tipo_pago: TIPO_PAGO_MAP[metodo],
        metodo_pago_cliente: metodo, // columna adicional para detalle de canal
        verificado: false, // La cooperativa lo verifica en su Panel
      };

      if (cooperativa_id) pagoPayload.cooperativa_id = cooperativa_id;
      if (encomienda_id) pagoPayload.encomienda_id = encomienda_id;

      if (!isEfectivo) {
        pagoPayload.numero_referencia = referencia.trim();
        pagoPayload.fecha_transaccion = fecha.trim();
        pagoPayload.banco_emisor = banco;
      }

      setCurrentPayload(pagoPayload);

      // ── Insertar en `pagos` solo si tenemos un ID válido (encomienda o boleto ya creado) ─
      // Si no hay ninguno, el padre creará los boletos y luego el pago usando el payload.
      if (encomienda_id || (boleto_ids && boleto_ids.length > 0)) {
        const { data: pago, error: pagoError } = await supabase
          .from('pagos')
          .insert(pagoPayload)
          .select('id')
          .single();

        if (pagoError) throw pagoError;

        // Si hay boletos vinculados (previamente creados), actualizamos su estado
        // (Nota: la app actualmente delega la creación de boletos al padre, por lo que esto
        // se ejecutará mayormente en flujos futuros o de encomiendas)
        if (boleto_ids && boleto_ids.length > 0 && pago?.id) {
          // El esquema de boletos no tiene pago_id, así que no podemos hacer el update en boletos.
          // El diseño asume que boletos se crean después y se asigna el boleto_id al pago.
        }

        setPagoId(pago?.id);
      }

      setStep('enviado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[PaymentFlow] Error al registrar pago:', msg);
      Alert.alert(
        'Error al enviar comprobante',
        `No se pudo registrar el pago. Inténtalo de nuevo.\n\n${msg}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Paso: Enviado ───────────────────────────────────────────────────────────
  if (step === 'enviado') {
    return (
      <View className="bg-card rounded-[14px] p-8 border border-border items-center">
        <View className="size-20 bg-success/20 rounded-full items-center justify-center mb-4">
          <CheckCircle weight="fill" color="#16a34a" size={40} />
        </View>
        <Text className="font-heading text-xl text-foreground text-center mb-2">Comprobante Enviado</Text>
        <Text className="text-sm text-muted-foreground text-center mb-6 leading-5">
          La cooperativa verificará tu pago. Cuando sea confirmado, tu transacción será procesada.
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
            <Text className="text-sm text-foreground">Presenta este código al llegar a taquilla para completar tu pago.</Text>
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

  // ── Paso: Formulario de comprobante ────────────────────────────────────────
  if (step === 'formulario') {
    return (
      <View className="bg-card rounded-[14px] p-6 border border-border">
        {/* Volver */}
        <Pressable onPress={() => setStep('metodos')} className="flex-row items-center mb-6 gap-2">
          <X color="#a3a3a3" size={16} weight="bold" />
          <Text className="text-sm text-muted-foreground">Volver</Text>
        </Pressable>

        <Text className="font-heading text-lg text-foreground mb-1">Confirmar Pago</Text>
        <Text className="text-sm text-muted-foreground mb-6">
          Método: {metodos.find(m => m.id === metodo)?.label}
        </Text>

        {/* Monto */}
        <View className="bg-primary/10 rounded-[10px] px-4 py-3 mb-6 border border-primary/20 items-center">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Monto a pagar</Text>
          <Text className="font-heading text-3xl text-primary">{monto} Bs.</Text>
          {concepto && <Text className="text-xs text-muted-foreground mt-1">{concepto}</Text>}
        </View>

        {/* Efectivo: solo confirmación */}
        {isEfectivo ? (
          <View className="bg-warning/10 border border-warning/30 rounded-[10px] p-4 mb-6">
            <Text className="text-sm text-foreground font-bold mb-1">Pago en Taquilla</Text>
            <Text className="text-sm text-muted-foreground leading-5">
              Al seleccionar esta opción, quedará registrado como pago pendiente.
              Deberás presentarte en taquilla para completarlo.
            </Text>
          </View>
        ) : (
          /* Digital: referencia + fecha + banco */
          <View className="gap-4">
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
        )}

        {/* Botón de envío */}
        <Pressable
          onPress={handleSubmitPago}
          disabled={!isFormValid || isSubmitting}
          className={`h-12 rounded-[10px] items-center justify-center mt-6 ${isFormValid ? 'bg-primary' : 'bg-primary/40'}`}
        >
          {isSubmitting
            ? <Spinner />
            : <Text className={`font-bold ${isFormValid ? 'text-primary-foreground' : 'text-primary-foreground/50'}`}>
                {isEfectivo ? 'Registrar Pago en Efectivo' : 'Enviar Comprobante'}
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
      </View>
    );
  }

  // ── Paso 1: Selección de método ─────────────────────────────────────────────
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
