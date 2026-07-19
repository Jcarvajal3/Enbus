import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@/tw';
import { TextInput, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { CheckCircle, CreditCard, Bank, X, Info } from 'phosphor-react-native';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from './PressableScale';
import { useTasaBCV, bsToUsd } from '@/src/hooks/useTasaBCV';
import { Colors, Typography, Spacing, Radius, Shadows } from '@/src/theme';

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

// ─── MontoBadge ───────────────────────────────────────────────────────────────
// Muestra el monto en Bs y, si el método es Zelle, el equivalente en USD
// usando la tasa BCV oficial consultada en tiempo real.
interface MontoBadgeProps {
  monto: number;
  montoUSD: number | null;
  tasaBCV: number | null;
  loadingTasa: boolean;
  errorTasa: string | null;
  isZelle: boolean;
  label: string;
  concepto?: string;
}

function MontoBadge({ monto, montoUSD, tasaBCV, loadingTasa, errorTasa, isZelle, label, concepto }: MontoBadgeProps) {
  return (
    <View style={s.montoBadge}>
      <Text style={s.montoBadgeLabel}>{label}</Text>

      {/* Monto en Bs — siempre visible */}
      <Text style={s.montoBadgeAmount}>
        {monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
      </Text>

      {/* Equivalente USD — solo para Zelle */}
      {isZelle && (
        <View style={s.montoUsdContainer}>
          {loadingTasa ? (
            <View style={s.montoRow}>
              <ActivityIndicator size="small" color={Colors.mutedForeground} />
              <Text style={s.montoBadgeHint}>Consultando tasa BCV...</Text>
            </View>
          ) : montoUSD !== null ? (
            <View style={s.montoUsdBlock}>
              <Text style={s.montoBadgeUsd}>
                ≈ {montoUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </Text>
              <View style={s.montoRow}>
                <Info size={11} color={Colors.mutedForeground} weight="fill" />
                <Text style={s.montoBadgeHint}>
                  Tasa BCV oficial: {tasaBCV?.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/USD
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.montoRow}>
              <Info size={11} color={Colors.warning} weight="fill" />
              <Text style={s.montoBadgeWarning}>
                {errorTasa ? 'Tasa BCV no disponible. Verifica el monto con tu banco.' : 'Calculando equivalente USD...'}
              </Text>
            </View>
          )}
          <Text style={s.montoBadgeFootnote}>
            Transfiere el equivalente en USD por Zelle
          </Text>
        </View>
      )}

      {/* Nota: para métodos en Bs (Pago Móvil, Transferencia) solo se muestra el monto en Bs */}
      {!isZelle && concepto && (
        <Text style={s.montoBadgeConcepto}>{concepto}</Text>
      )}
    </View>
  );
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

  // Tasa BCV oficial para conversión Bs → USD (Zelle)
  const { tasa: tasaBCV, loading: loadingTasa, error: errorTasa } = useTasaBCV();

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
  const isZelle = metodoSeleccionado?.tipo === 'ZELLE';

  // Equivalente USD para métodos en dólares (Zelle)
  const montoUSD = bsToUsd(monto, tasaBCV);

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
      <View style={s.loadingContainer}>
        <Spinner size="large" />
        <Text style={s.loadingText}>Cargando cuentas bancarias...</Text>
      </View>
    );
  }

  // Paso 3: Enviado
  if (step === 'enviado') {
    return (
      <View style={s.card}>
        <View style={s.successIconContainer}>
          <CheckCircle weight="fill" color={Colors.success} size={40} />
        </View>
        <Text style={s.successTitle}>Comprobante Enviado</Text>
        <Text style={s.successSubtitle}>
          La cooperativa verificará tu pago. Una vez verificado por un taquillero, tu reserva/envío será confirmado.
        </Text>

        {!isEfectivo && referencia ? (
          <View style={s.referenciaContainer}>
            <Text style={s.referenciaLabel}>Referencia registrada</Text>
            <Text style={s.referenciaValue}>{referencia}</Text>
          </View>
        ) : null}

        {isEfectivo && (
          <View style={s.efectivoNote}>
            <Text style={s.efectivoNoteLabel}>Pago en efectivo</Text>
            <Text style={s.efectivoNoteText}>Completa tu pago al presentarte en la taquilla de la cooperativa.</Text>
          </View>
        )}

        {onPaymentSuccess && (
          <PressableScale
            onPress={() => onPaymentSuccess(pagoId, currentPayload)}
            haptic
            hapticType="medium"
            style={s.primaryButton}
            accessibilityLabel="Continuar"
            accessibilityRole="button"
          >
            <Text style={s.primaryButtonText}>Continuar</Text>
          </PressableScale>
        )}
      </View>
    );
  }

  // Paso 2: Formulario de comprobante
  if (step === 'formulario') {
    const info = METODO_INFO[metodoSeleccionado?.tipo] || { label: 'Pago', desc: '' };
    return (
      <ScrollView
        style={s.formScrollContainer}
        contentContainerStyle={s.formContent}
      >
        {/* Volver */}
        <PressableScale
          onPress={() => setStep('metodos')}
          style={s.backRow}
          accessibilityLabel="Volver a métodos de pago"
          accessibilityRole="button"
        >
          <X color={Colors.mutedForeground} size={16} weight="bold" />
          <Text style={s.backText}>Volver a métodos</Text>
        </PressableScale>

        <Text style={s.sectionTitle}>Confirmar Pago</Text>
        <Text style={s.sectionSubtitle}>
          Método: {info.label}
        </Text>

        {/* Monto */}
        <MontoBadge
          monto={monto}
          montoUSD={montoUSD}
          tasaBCV={tasaBCV}
          loadingTasa={loadingTasa}
          errorTasa={errorTasa}
          isZelle={isZelle}
          label="Monto a pagar"
          concepto={concepto}
        />

        {/* Datos reales de la Cooperativa */}
        {!isEfectivo && (
          <View style={s.cuentaDataContainer}>
            <Text style={s.cuentaDataTitle}>Datos de Cuenta</Text>
            {metodoSeleccionado.tipo === 'PAGO_MOVIL' && (
              <View style={s.cuentaFieldsGap}>
                {metodoSeleccionado.banco && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Banco:</Text> {metodoSeleccionado.banco}</Text>}
                <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.numero_cuenta && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Teléfono PM:</Text> {metodoSeleccionado.numero_cuenta}</Text>}
                {metodoSeleccionado.cedula_rif && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>C.I. / RIF:</Text> {metodoSeleccionado.cedula_rif}</Text>}
              </View>
            )}
            {metodoSeleccionado.tipo === 'TRANSFERENCIA_BANCARIA' && (
              <View style={s.cuentaFieldsGap}>
                {metodoSeleccionado.banco && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Banco:</Text> {metodoSeleccionado.banco}</Text>}
                <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.numero_cuenta && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Nro. Cuenta:</Text> {metodoSeleccionado.numero_cuenta}</Text>}
                {metodoSeleccionado.cedula_rif && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>C.I. / RIF:</Text> {metodoSeleccionado.cedula_rif}</Text>}
              </View>
            )}
            {metodoSeleccionado.tipo === 'ZELLE' && (
              <View style={s.cuentaFieldsGap}>
                <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Titular:</Text> {metodoSeleccionado.titular}</Text>
                {metodoSeleccionado.email_zelle && <Text style={s.cuentaDataRow}><Text style={s.cuentaFieldBold}>Correo Zelle:</Text> {metodoSeleccionado.email_zelle}</Text>}
              </View>
            )}
            {metodoSeleccionado.instrucciones && (
              <Text style={s.cuentaInstructions}>
                Nota: {metodoSeleccionado.instrucciones}
              </Text>
            )}
          </View>
        )}

        {/* Form Fields */}
        {isEfectivo ? (
          <View style={s.efectivoFormNote}>
            <Text style={s.efectivoFormTitle}>Pago en Taquilla</Text>
            <Text style={s.efectivoFormText}>
              Al seleccionar esta opción, tu reserva quedará pendiente.
              Deberás realizar el pago directamente en la ventanilla de la cooperativa.
            </Text>
          </View>
        ) : (
          <View style={s.formFieldsGap}>
            <View>
              <Text style={s.fieldLabel}>Número de Referencia</Text>
              <TextInput
                style={s.textInput}
                placeholder="Últimos 4 o más dígitos"
                placeholderTextColor={Colors.mutedForeground}
                keyboardType="number-pad"
                value={referencia}
                onChangeText={setReferencia}
                accessibilityLabel="Número de referencia de la transacción"
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>Fecha de Transacción</Text>
              <TextInput
                style={s.textInput}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={Colors.mutedForeground}
                keyboardType="number-pad"
                value={fecha}
                onChangeText={setFecha}
                accessibilityLabel="Fecha de la transacción en formato DD/MM/AAAA"
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>Banco Emisor (Tu banco)</Text>
              <PressableScale
                onPress={() => setIsBancoModalVisible(true)}
                style={s.bancoSelector}
                accessibilityLabel={banco ? `Banco seleccionado: ${banco}` : 'Seleccionar banco emisor'}
                accessibilityRole="button"
              >
                <Text style={banco ? s.bancoSelectorText : s.bancoSelectorPlaceholder}>
                  {banco || 'Seleccionar banco...'}
                </Text>
                <Bank color={Colors.mutedForeground} size={20} weight="bold" />
              </PressableScale>
            </View>
          </View>
        )}

        {/* Submit */}
        <PressableScale
          onPress={handleSubmitPago}
          disabled={!isFormValid || isSubmitting}
          haptic
          hapticType="medium"
          style={[s.primaryButton, s.formSubmitButton, !isFormValid && s.primaryButtonDisabled]}
          accessibilityLabel={isEfectivo ? 'Confirmar pago en taquilla' : 'Registrar pago'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isFormValid || isSubmitting }}
        >
          {isSubmitting
            ? <Spinner />
            : <Text style={[s.primaryButtonText, !isFormValid && s.primaryButtonTextDisabled]}>
                {isEfectivo ? 'Confirmar Pago en Taquilla' : 'Registrar Pago'}
              </Text>
          }
        </PressableScale>

        {/* Modal de selección de banco */}
        <Modal
          visible={isBancoModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsBancoModalVisible(false)}
        >
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Banco Emisor</Text>
              <PressableScale
                onPress={() => setIsBancoModalVisible(false)}
                style={s.modalCloseButton}
                accessibilityLabel="Cerrar selección de banco"
                accessibilityRole="button"
              >
                <X color={Colors.foreground} weight="bold" size={20} />
              </PressableScale>
            </View>
            <ScrollView style={s.modalScroll}>
              {BANCOS_VE.map((b, i) => (
                <PressableScale
                  key={b}
                  onPress={() => { setBanco(b); setIsBancoModalVisible(false); }}
                  haptic
                  style={[s.bancoRow, i !== BANCOS_VE.length - 1 && s.bancoRowBorder]}
                  accessibilityLabel={b}
                  accessibilityRole="button"
                >
                  <View style={s.bancoIconContainer}>
                    <Bank color={Colors.primary} weight="fill" size={20} />
                  </View>
                  <Text style={s.bancoName}>{b}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // Paso 1: Selección de método
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Método de Pago</Text>
      {concepto && <Text style={s.sectionSubtitle}>{concepto}</Text>}

      {/* ── Monto: Paso 1 – selección de método ── */}
      <MontoBadge
        monto={monto}
        montoUSD={null}
        tasaBCV={null}
        loadingTasa={false}
        errorTasa={null}
        isZelle={false}
        label="Total a Transferir"
      />

      <View style={s.metodosList}>
        {metodosDisponibles.map((m) => {
          const info = METODO_INFO[m.tipo] || { label: m.tipo, desc: 'Cuenta de la cooperativa' };
          return (
            <PressableScale
              key={m.id}
              onPress={() => { setMetodoSeleccionado(m); setStep('formulario'); }}
              haptic
              scaleValue={0.97}
              style={s.metodoCard}
              accessibilityLabel={`Seleccionar método de pago: ${info.label}`}
              accessibilityRole="button"
            >
              <View style={s.metodoIconContainer}>
                <CreditCard color={Colors.primary} weight="fill" size={22} />
              </View>
              <View style={s.metodoInfo}>
                <Text style={s.metodoLabel}>{info.label}</Text>
                <Text style={s.metodoDesc} numberOfLines={1}>{m.banco ? `${m.banco} - ` : ''}{info.desc}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Card wrapper (loading, enviado, métodos) ─────────────────
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing['2xl'],
  },
  loadingContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    marginTop: Spacing.sm,
  },

  // ── MontoBadge ───────────────────────────────────────────────
  montoBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg - 2,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
  },
  montoBadgeLabel: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  montoBadgeAmount: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes['3xl'],
    fontWeight: Typography.weights.heavy,
    color: Colors.primary,
  },
  montoUsdContainer: {
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  montoUsdBlock: {
    alignItems: 'center',
  },
  montoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  montoBadgeUsd: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
  },
  montoBadgeHint: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs - 1,
    color: Colors.mutedForeground,
  },
  montoBadgeWarning: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.warning,
  },
  montoBadgeFootnote: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs - 1,
    color: Colors.mutedForeground,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  montoBadgeConcepto: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },

  // ── Success (enviado) ────────────────────────────────────────
  successIconContainer: {
    width: Spacing['4xl'] * 2,
    height: Spacing['4xl'] * 2,
    backgroundColor: Colors.successLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    alignSelf: 'center',
  },
  successTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
    lineHeight: 20,
  },
  referenciaContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    width: '100%',
    marginBottom: Spacing['2xl'],
  },
  referenciaLabel: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  referenciaValue: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
  },
  efectivoNote: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    width: '100%',
    marginBottom: Spacing['2xl'],
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  efectivoNoteLabel: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.primary,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  efectivoNoteText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.foreground,
  },

  // ── Primary Button ───────────────────────────────────────────
  primaryButton: {
    height: Spacing['5xl'],
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    width: '100%',
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  primaryButtonText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.primaryForeground,
    fontSize: Typography.sizes.base,
  },
  primaryButtonTextDisabled: {
    color: Colors.mutedForeground,
  },

  // ── Formulario ───────────────────────────────────────────────
  formScrollContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
  },
  formContent: {
    padding: Spacing['2xl'],
  },
  formSubmitButton: {
    marginTop: Spacing['2xl'],
    marginBottom: Spacing['3xl'],
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    gap: Spacing.sm,
  },
  backText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
  },
  sectionTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.lg + 1,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
    marginBottom: Spacing.lg,
  },
  cuentaDataContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cuentaDataTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs - 1,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  cuentaFieldsGap: {
    gap: Spacing.xs,
  },
  cuentaDataRow: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.foreground,
  },
  cuentaFieldBold: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
  cuentaInstructions: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  formFieldsGap: {
    gap: Spacing.lg,
  },
  fieldLabel: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
    marginBottom: Spacing.sm,
  },
  textInput: {
    fontFamily: Typography.family,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg - 2,
    height: Spacing['5xl'],
    borderRadius: Radius.sm,
    fontSize: Typography.sizes.base,
    color: Colors.foreground,
  },
  bancoSelector: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    height: Spacing['5xl'],
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg - 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bancoSelectorText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    color: Colors.foreground,
  },
  bancoSelectorPlaceholder: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    color: Colors.mutedForeground,
  },
  efectivoFormNote: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  efectivoFormTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm + 1,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginBottom: Spacing.xs,
  },
  efectivoFormText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    color: Colors.mutedForeground,
    lineHeight: 20,
  },

  // ── Modal de Banco ───────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingTop: Spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  modalCloseButton: {
    width: Spacing['4xl'],
    height: Spacing['4xl'],
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
  },
  bancoRow: {
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bancoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  bancoIconContainer: {
    width: Spacing['4xl'],
    height: Spacing['4xl'],
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bancoName: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginLeft: Spacing.lg,
  },

  // ── Selección de método (Paso 1) ────────────────────────────
  metodosList: {
    gap: Spacing.md,
  },
  metodoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  metodoIconContainer: {
    width: Spacing['4xl'] + Spacing.xs,
    height: Spacing['4xl'] + Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
  },
  metodoInfo: {
    flex: 1,
  },
  metodoLabel: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm + 1,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  metodoDesc: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
  },
});
