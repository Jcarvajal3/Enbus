import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ArrowLeft,
  Bank,
  CheckCircle,
  CreditCard,
  Info,
  Money,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from './PressableScale';
import {
  BottomSheet,
  Button,
  Card,
  Field,
  LoadingState,
  SectionLabel,
  SelectField,
  Text,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { bsToUsd, useTasaBCV } from '@/src/hooks/useTasaBCV';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

// ─── Bancos de Venezuela ─────────────────────────────────────────────────────

const BANCOS_VE = [
  'Banco de Venezuela', 'Bancamiga', 'Banesco', 'BBVA Provincial',
  'Mercantil', 'BNC', 'Banco Exterior', 'Bicentenario',
  'Banco del Tesoro', 'Banco Agrícola de Venezuela',
  'Banco Nacional de Crédito (BNC)', 'Banplus',
  'Banco Venezolano de Crédito', 'Sofitasa', 'BOD',
  'Bancrecer', 'Mi Banco', 'Banco de la Fuerza Armada (BANFANB)',
  'Otras', 'Zelle', 'PayPal',
];

const METODO_INFO: Record<string, { label: string; desc: string }> = {
  PAGO_MOVIL: { label: 'Pago Móvil', desc: 'Transferencia instantánea en bolívares' },
  TRANSFERENCIA_BANCARIA: { label: 'Transferencia bancaria', desc: 'Desde tu cuenta nacional' },
  ZELLE: { label: 'Zelle / Divisas', desc: 'Pago electrónico en dólares' },
  EFECTIVO: { label: 'Efectivo en taquilla', desc: 'Pago directo en la taquilla' },
};

type FlowStep = 'metodos' | 'formulario' | 'enviado';

interface MetodoCuenta {
  id: string;
  tipo: string;
  banco?: string;
  titular?: string;
  numero_cuenta?: string;
  cedula_rif?: string;
  email_zelle?: string;
  instrucciones?: string;
  cooperativa_id?: string;
}

interface PaymentFlowProps {
  monto: number;
  cooperativa_id?: string;
  concepto?: string;
  encomienda_id?: string;
  boleto_ids?: string[];
  onPaymentSuccess?: (pagoId?: string, pagoPayload?: Record<string, unknown>) => void;
}

const money = (value: number) =>
  value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const { tasa: tasaBCV, loading: loadingTasa, error: errorTasa } = useTasaBCV();

  const [step, setStep] = useState<FlowStep>('metodos');
  const [metodos, setMetodos] = useState<MetodoCuenta[]>([]);
  const [loadingMetodos, setLoadingMetodos] = useState(true);
  const [metodo, setMetodo] = useState<MetodoCuenta | null>(null);

  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [banco, setBanco] = useState('');
  const [bancoSheetVisible, setBancoSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pagoId, setPagoId] = useState<string | undefined>();
  const [payload, setPayload] = useState<Record<string, unknown> | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Métodos de pago de la cooperativa ────────────────────────────────────
  useEffect(() => {
    if (!cooperativa_id) {
      setLoadingMetodos(false);
      return;
    }

    let isMounted = true;
    supabase
      .from('metodos_pago_cooperativa')
      .select('*')
      .eq('cooperativa_id', cooperativa_id)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (error && __DEV__) {
          console.error('[PaymentFlow] Error cargando métodos:', error.message);
        }
        if (isMounted) {
          setMetodos(data ?? []);
          setLoadingMetodos(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cooperativa_id]);

  // Efectivo siempre está disponible como último recurso.
  const disponibles: MetodoCuenta[] =
    metodos.length > 0 ? metodos : [{ id: 'fallback-efectivo', tipo: 'EFECTIVO', cooperativa_id }];

  const isEfectivo = metodo?.tipo === 'EFECTIVO';
  const isZelle = metodo?.tipo === 'ZELLE';
  const montoUSD = bsToUsd(monto, tasaBCV);

  /** `DD/MM/AAAA` that also has to be a real calendar date. */
  const parseFecha = (value: string): Date | null => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) return null;
    const [day, month, year] = value.trim().split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const valid =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return valid ? date : null;
  };

  const validate = (): boolean => {
    if (isEfectivo) return true;

    const next: Record<string, string> = {};
    const ref = referencia.trim();
    if (!/^\d{4,}$/.test(ref)) next.referencia = 'Ingresa al menos 4 dígitos numéricos.';
    if (!parseFecha(fecha)) next.fecha = 'Usa el formato DD/MM/AAAA.';
    if (!banco.trim()) next.banco = 'Selecciona el banco desde el que pagaste.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!metodo || !user) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setSubmitting(true);
    try {
      const pagoPayload: Record<string, unknown> = {
        pagador_id: user.id,
        monto,
        tipo_pago: isEfectivo ? 'EFECTIVO' : 'DIGITAL',
        verificado: false,
      };

      if (cooperativa_id) pagoPayload.cooperativa_id = cooperativa_id;
      if (encomienda_id) pagoPayload.encomienda_id = encomienda_id;
      if (metodo.id && metodo.id !== 'fallback-efectivo') {
        pagoPayload.metodo_pago_id = metodo.id;
      }

      if (!isEfectivo) {
        const parsed = parseFecha(fecha);
        pagoPayload.numero_referencia = referencia.trim();
        pagoPayload.fecha_transaccion = parsed
          ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
              parsed.getDate()
            ).padStart(2, '0')}`
          : null;
        pagoPayload.banco_emisor = banco;
      }

      setPayload(pagoPayload);

      // Cuando el recurso ya existe insertamos el pago aquí; si no, lo hace la
      // pantalla que crea el boleto, para no dejar pagos huérfanos.
      if (encomienda_id || (boleto_ids && boleto_ids.length > 0)) {
        const { data: pago, error } = await supabase
          .from('pagos')
          .insert(pagoPayload)
          .select('id')
          .single();
        if (error) throw error;
        setPagoId(pago?.id);
      }

      setStep('enviado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (__DEV__) console.error('[PaymentFlow] Error registrando pago:', message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo registrar el pago: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMetodos) {
    return (
      <Card padding="lg">
        <LoadingState label="Cargando formas de pago…" compact />
      </Card>
    );
  }

  // ─── Paso 3: comprobante enviado ───────────────────────────────────────────
  if (step === 'enviado') {
    return (
      <Card padding="lg">
        <View style={s.successIcon}>
          <CheckCircle weight="fill" color={Colors.success} size={Sizes.icon['2xl']} />
        </View>

        <Text variant="heading" align="center">
          Comprobante enviado
        </Text>
        <Text variant="secondary" color="muted" align="center" style={s.successText}>
          La cooperativa verificará tu pago. Tu reserva se confirma en cuanto un taquillero lo
          valide.
        </Text>

        {!isEfectivo && referencia ? (
          <View style={s.receipt}>
            <Text variant="overline" color="muted" uppercase>
              Referencia registrada
            </Text>
            <Text variant="bodyStrong" weight="heavy">
              {referencia}
            </Text>
          </View>
        ) : null}

        {isEfectivo && (
          <View style={[s.receipt, s.receiptHighlight]}>
            <Text variant="overline" color="primary" uppercase>
              Pago en efectivo
            </Text>
            <Text variant="secondary">
              Completa tu pago al presentarte en la taquilla de la cooperativa.
            </Text>
          </View>
        )}

        {onPaymentSuccess && (
          <Button variant="primary" fullWidth onPress={() => onPaymentSuccess(pagoId, payload)}>
            Continuar
          </Button>
        )}
      </Card>
    );
  }

  // ─── Paso 2: formulario ────────────────────────────────────────────────────
  if (step === 'formulario' && metodo) {
    const info = METODO_INFO[metodo.tipo] ?? { label: 'Pago', desc: '' };

    return (
      <Card padding="md">
        <PressableScale
          onPress={() => setStep('metodos')}
          scaleValue={Motion.press.button}
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel="Volver a métodos de pago"
        >
          <ArrowLeft color={Colors.mutedForeground} size={Sizes.icon.sm} weight="bold" />
          <Text variant="caption" color="muted">
            Volver a métodos
          </Text>
        </PressableScale>

        <Text variant="heading">Confirmar pago</Text>
        <Text variant="secondary" color="muted" style={s.subtitle}>
          {info.label}
        </Text>

        <AmountBadge
          label="Monto a pagar"
          monto={monto}
          montoUSD={isZelle ? montoUSD : null}
          tasaBCV={tasaBCV}
          loadingTasa={isZelle && loadingTasa}
          errorTasa={errorTasa}
          concepto={!isZelle ? concepto : undefined}
        />

        {!isEfectivo && (
          <View style={s.accountBox}>
            <SectionLabel>Datos de la cuenta</SectionLabel>
            {metodo.banco ? <AccountRow label="Banco" value={metodo.banco} /> : null}
            {metodo.titular ? <AccountRow label="Titular" value={metodo.titular} /> : null}
            {metodo.tipo === 'PAGO_MOVIL' && metodo.numero_cuenta ? (
              <AccountRow label="Teléfono PM" value={metodo.numero_cuenta} />
            ) : null}
            {metodo.tipo === 'TRANSFERENCIA_BANCARIA' && metodo.numero_cuenta ? (
              <AccountRow label="Nro. de cuenta" value={metodo.numero_cuenta} />
            ) : null}
            {metodo.tipo === 'ZELLE' && metodo.email_zelle ? (
              <AccountRow label="Correo Zelle" value={metodo.email_zelle} />
            ) : null}
            {metodo.cedula_rif ? <AccountRow label="C.I. / RIF" value={metodo.cedula_rif} /> : null}

            {metodo.instrucciones ? (
              <Text variant="caption" color="muted" style={s.instructions}>
                {metodo.instrucciones}
              </Text>
            ) : null}
          </View>
        )}

        {isEfectivo ? (
          <View style={[s.receipt, s.receiptHighlight, s.efectivoNote]}>
            <Text variant="bodyStrong">Pago en taquilla</Text>
            <Text variant="secondary" color="muted">
              Tu reserva quedará pendiente hasta que pagues directamente en la ventanilla de la
              cooperativa.
            </Text>
          </View>
        ) : (
          <>
            <Field
              label="Número de referencia"
              placeholder="Últimos 4 dígitos o más"
              keyboardType="number-pad"
              tone="sunken"
              value={referencia}
              onChangeText={(v) => {
                setReferencia(v);
                setErrors((prev) => ({ ...prev, referencia: '' }));
              }}
              error={errors.referencia}
            />

            <Field
              label="Fecha de la transacción"
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              tone="sunken"
              value={fecha}
              onChangeText={(v) => {
                setFecha(v);
                setErrors((prev) => ({ ...prev, fecha: '' }));
              }}
              error={errors.fecha}
            />

            <SelectField
              label="Banco emisor"
              placeholder="Selecciona tu banco"
              icon={Bank}
              tone="sunken"
              value={banco}
              onPress={() => setBancoSheetVisible(true)}
              error={errors.banco}
            />
          </>
        )}

        <Button
          variant="primary"
          fullWidth
          loading={submitting}
          onPress={handleSubmit}
          style={s.submit}
        >
          {isEfectivo ? 'Confirmar pago en taquilla' : 'Registrar pago'}
        </Button>

        <BottomSheet
          visible={bancoSheetVisible}
          onClose={() => setBancoSheetVisible(false)}
          title="Banco emisor"
          height="70%"
        >
          <ScrollView contentContainerStyle={s.bancoList} showsVerticalScrollIndicator={false}>
            {BANCOS_VE.map((option) => (
              <PressableScale
                key={option}
                onPress={() => {
                  setBanco(option);
                  setErrors((prev) => ({ ...prev, banco: '' }));
                  setBancoSheetVisible(false);
                }}
                haptic
                hapticType="selection"
                scaleValue={Motion.press.card}
                style={s.bancoRow}
                accessibilityRole="button"
                accessibilityState={{ selected: banco === option }}
                accessibilityLabel={option}
              >
                <View style={s.bancoIcon}>
                  <Bank color={Colors.primary} weight="fill" size={Sizes.icon.md} />
                </View>
                <Text variant="bodyStrong" weight={banco === option ? 'bold' : 'medium'}>
                  {option}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        </BottomSheet>
      </Card>
    );
  }

  // ─── Paso 1: elegir método ─────────────────────────────────────────────────
  return (
    <Card padding="md">
      <Text variant="heading">Método de pago</Text>
      {concepto ? (
        <Text variant="secondary" color="muted" style={s.subtitle} numberOfLines={2}>
          {concepto}
        </Text>
      ) : null}

      <AmountBadge label="Total a transferir" monto={monto} />

      <View style={s.metodos}>
        {disponibles.map((option) => {
          const info = METODO_INFO[option.tipo] ?? {
            label: option.tipo,
            desc: 'Cuenta de la cooperativa',
          };
          const Icon = option.tipo === 'EFECTIVO' ? Money : CreditCard;

          return (
            <PressableScale
              key={option.id}
              onPress={() => {
                setMetodo(option);
                setErrors({});
                setStep('formulario');
              }}
              haptic
              hapticType="selection"
              scaleValue={Motion.press.card}
              style={s.metodoCard}
              accessibilityRole="button"
              accessibilityLabel={`${info.label}. ${info.desc}`}
            >
              <View style={s.metodoIcon}>
                <Icon color={Colors.primary} weight="fill" size={Sizes.icon.lg} />
              </View>
              <View style={s.metodoBody}>
                <Text variant="bodyStrong">{info.label}</Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {option.banco ? `${option.banco} · ${info.desc}` : info.desc}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

// ─── Amount badge ────────────────────────────────────────────────────────────

function AmountBadge({
  label,
  monto,
  montoUSD,
  tasaBCV,
  loadingTasa,
  errorTasa,
  concepto,
}: {
  label: string;
  monto: number;
  montoUSD?: number | null;
  tasaBCV?: number | null;
  loadingTasa?: boolean;
  errorTasa?: string | null;
  concepto?: string;
}) {
  return (
    <View style={s.amount}>
      <Text variant="overline" color="muted" uppercase>
        {label}
      </Text>
      <Text variant="display" size="3xl" color="primary" compact style={s.amountValue}>
        {`${money(monto)} Bs`}
      </Text>

      {loadingTasa ? (
        <Text variant="caption" color="muted" align="center">
          Consultando tasa BCV…
        </Text>
      ) : montoUSD != null ? (
        <>
          <Text variant="heading" size="xl" color="accent" compact>
            {`≈ ${money(montoUSD)} USD`}
          </Text>
          <View style={s.amountHint}>
            <Info size={Sizes.icon.xs} color={Colors.mutedForeground} weight="fill" />
            <Text variant="caption" size="xs" color="muted">
              {`Tasa BCV oficial: ${tasaBCV ? money(tasaBCV) : '—'} Bs/USD`}
            </Text>
          </View>
          <Text variant="caption" size="xs" color="muted" align="center">
            Transfiere el equivalente en USD por Zelle.
          </Text>
        </>
      ) : errorTasa ? (
        <View style={s.amountHint}>
          <Info size={Sizes.icon.xs} color={Colors.warning} weight="fill" />
          <Text variant="caption" color="warning" align="center">
            Tasa BCV no disponible. Verifica el monto con tu banco.
          </Text>
        </View>
      ) : concepto ? (
        <Text variant="caption" color="muted" align="center" numberOfLines={2}>
          {concepto}
        </Text>
      ) : null}
    </View>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.accountRow}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" size="sm" style={s.accountValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  subtitle: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },

  amount: {
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderWidth: Sizes.hairline,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  amountValue: {
    marginVertical: Spacing.xs,
  },
  amountHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  accountBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  accountValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  instructions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
    fontStyle: 'italic',
  },

  successIcon: {
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  successText: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  receipt: {
    width: '100%',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
  receiptHighlight: {
    backgroundColor: Colors.primaryLight,
    borderWidth: Sizes.hairline,
    borderColor: Colors.primaryBorder,
  },
  efectivoNote: {
    marginBottom: Spacing.lg,
  },

  submit: {
    marginTop: Spacing.md,
  },

  metodos: {
    gap: Spacing.md,
  },
  metodoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
  },
  metodoIcon: {
    width: Sizes.iconBox.lg,
    height: Sizes.iconBox.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metodoBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },

  bancoList: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
  },
  bancoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    minHeight: Sizes.touchTarget + Spacing.md,
  },
  bancoIcon: {
    width: Sizes.iconBox.lg - Spacing.sm,
    height: Sizes.iconBox.lg - Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
