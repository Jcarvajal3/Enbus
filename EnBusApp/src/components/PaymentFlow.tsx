/**
 * PaymentFlow — registrar el pago de un boleto o de una encomienda.
 *
 * El componente no escribe en la base: junta lo que el usuario declara
 * (método, referencia, fecha, banco y monto pagado) y se lo entrega a
 * `onRegistrar`, que llama a la RPC (`fn_checkout_boletos` o
 * `fn_registrar_pago_encomienda`). El monto lo calcula el servidor y llega en
 * `cotizacion` (USD de referencia + Bs a la tasa BCV vigente).
 *
 * - Éxito: `onRegistrar` se resuelve y la pantalla decide a dónde ir.
 * - Error: `onRegistrar` lanza el error de la RPC; el formulario se queda con
 *   los datos, marca el campo de `details.campo` y muestra el mensaje. Si la
 *   pantalla ya manejó el error (p. ej. `EB_TASA_CAMBIO` con su propio aviso),
 *   debe resolver sin lanzar.
 * - Efectivo: boletos → "Apartar y pagar en taquilla" (`onEfectivo`, sin pago);
 *   encomiendas → solo una tarjeta informativa.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import {
  ArrowLeft,
  Bank,
  CalendarBlank,
  Check,
  Copy,
  CreditCard,
  Info,
  MagnifyingGlass,
  Money,
  Storefront,
  WarningCircle,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { PressableScale } from './PressableScale';
import { CalendarModal } from './CalendarModal';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  LoadingState,
  SectionLabel,
  SelectField,
  Text,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { formatDateKey, toDateKey } from '@/src/utils/formatters';
import {
  formatBs,
  formatMoney,
  formatNumeroVE,
  formatUsd,
  tasaRefDe,
  type MonedaPago,
} from '@/src/utils/dinero';
import type { CotizacionPago, MetodoPago, PagoDeclarado } from '@/src/types';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

export type { CotizacionPago, PagoDeclarado } from '@/src/types';

// ─── Bancos de Venezuela ─────────────────────────────────────────────────────

interface BancoVE {
  /** Código SUDEBAN (los 4 primeros dígitos de la cuenta) */
  codigo: string;
  nombre: string;
  /** Otros nombres con los que la gente lo busca o lo escribe */
  alias: string[];
}

/**
 * APP-27 / M-23: lista canónica SUDEBAN, sin duplicados ni métodos que no son
 * bancos (Zelle, PayPal). Los 5 más usados primero; el resto por código.
 * BOD se fusionó con BNC y Bicentenario es hoy el Banco Digital de los
 * Trabajadores: quedan como alias para que la búsqueda los encuentre.
 */
const BANCOS_VE: BancoVE[] = [
  { codigo: '0102', nombre: 'Banco de Venezuela', alias: ['banco de venezuela', 'bdv'] },
  { codigo: '0134', nombre: 'Banesco', alias: ['banesco'] },
  { codigo: '0105', nombre: 'Mercantil', alias: ['mercantil'] },
  { codigo: '0108', nombre: 'BBVA Provincial', alias: ['provincial', 'bbva'] },
  { codigo: '0191', nombre: 'BNC Banco Nacional de Crédito', alias: ['bnc', 'nacional de credito', 'bod'] },
  { codigo: '0104', nombre: 'Venezolano de Crédito', alias: ['venezolano de credito'] },
  { codigo: '0114', nombre: 'Bancaribe', alias: ['bancaribe'] },
  { codigo: '0115', nombre: 'Banco Exterior', alias: ['exterior'] },
  { codigo: '0128', nombre: 'Banco Caroní', alias: ['caroni'] },
  { codigo: '0137', nombre: 'Sofitasa', alias: ['sofitasa'] },
  { codigo: '0138', nombre: 'Banco Plaza', alias: ['plaza'] },
  { codigo: '0146', nombre: 'Bangente', alias: ['bangente'] },
  { codigo: '0151', nombre: 'BFC Banco Fondo Común', alias: ['bfc', 'fondo comun'] },
  { codigo: '0156', nombre: '100% Banco', alias: ['100% banco', '100 banco'] },
  { codigo: '0157', nombre: 'DelSur', alias: ['delsur', 'del sur'] },
  { codigo: '0163', nombre: 'Banco del Tesoro', alias: ['tesoro'] },
  { codigo: '0166', nombre: 'Banco Agrícola de Venezuela', alias: ['agricola'] },
  { codigo: '0168', nombre: 'Bancrecer', alias: ['bancrecer'] },
  { codigo: '0169', nombre: 'R4 Banco Microfinanciero', alias: ['r4', 'mi banco'] },
  { codigo: '0171', nombre: 'Banco Activo', alias: ['banco activo'] },
  { codigo: '0172', nombre: 'Bancamiga', alias: ['bancamiga'] },
  { codigo: '0173', nombre: 'Banco Internacional de Desarrollo', alias: ['internacional de desarrollo'] },
  { codigo: '0174', nombre: 'Banplus', alias: ['banplus'] },
  { codigo: '0175', nombre: 'Banco Digital de los Trabajadores', alias: ['bicentenario', 'trabajadores'] },
  { codigo: '0177', nombre: 'BANFANB', alias: ['banfanb', 'fuerza armada'] },
  { codigo: '0178', nombre: 'N58 Banco Digital', alias: ['n58'] },
];

const OTRO_BANCO = 'Otro banco';

const bancoLabel = (b: BancoVE) => `${b.codigo} · ${b.nombre}`;

/** Lowercase, no accents — for search and name matching. */
const normalizar = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `palabra` appears in `texto` as a whole word (both already normalised). */
const contienePalabra = (texto: string, palabra: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(palabra)}($|[^a-z0-9])`).test(texto);

/**
 * The cooperative types its bank as free text ("Banesco", "BDV"…). Prefix the
 * SUDEBAN code when we can recognise it, so the user can pick it in their app.
 */
function bancoConCodigo(texto: string): string {
  if (/\b0\d{3}\b/.test(texto)) return texto;
  const n = normalizar(texto);
  const banco = BANCOS_VE.find(
    (b) => contienePalabra(n, normalizar(b.nombre)) || b.alias.some((a) => contienePalabra(n, a))
  );
  return banco ? `${banco.codigo} · ${texto}` : texto;
}

const METODO_INFO: Record<string, { label: string; desc: string }> = {
  PAGO_MOVIL: { label: 'Pago Móvil', desc: 'Transferencia instantánea en bolívares' },
  TRANSFERENCIA_BANCARIA: { label: 'Transferencia bancaria', desc: 'Desde tu cuenta nacional' },
  ZELLE: { label: 'Zelle / Divisas', desc: 'Pago electrónico en dólares' },
};

type FlowStep = 'metodos' | 'formulario' | 'efectivo';

/** APP-26 / M-20: the payment date is picked, never typed. */
type FechaOpcion = 'hoy' | 'ayer' | 'otra';

/** How far back "Otra fecha" lets the user go (same limit as the server). */
const DIAS_ATRAS_MAX = 30;

/** Campos del formulario que el servidor puede señalar en `details.campo`. */
type CampoFormulario = 'referencia' | 'banco' | 'fecha' | 'monto';
const CAMPOS_FORMULARIO: readonly string[] = ['referencia', 'banco', 'fecha', 'monto'];

const AVISO_SIN_TASA =
  'No pudimos obtener la tasa BCV de hoy, así que aún no podemos calcular el monto en bolívares. Intenta en unos minutos o paga en la taquilla.';

export interface PaymentFlowProps {
  /** Cooperativa dueña de las cuentas donde se paga */
  cooperativaId: string;
  /** Qué se paga: "2 boletos · Valencia → Caracas", "Encomienda EB-…" */
  concepto: string;
  tipoRecurso: 'boleto' | 'encomienda';
  /** Monto calculado por el servidor (USD de referencia + Bs a la tasa vigente) */
  cotizacion: CotizacionPago;
  /** Llama a la RPC de pago. Lanza el error de la RPC si falla. */
  onRegistrar: (d: PagoDeclarado) => Promise<void>;
  /** Solo boletos: "Apartar y pagar en taquilla" (no registra ningún pago) */
  onEfectivo?: () => void;
  /** Deshabilita todo (p. ej. la reserva venció o la pantalla está ocupada) */
  bloqueado?: boolean;
}

/** "1250,00" — what a Venezuelan banking app accepts when pasted. */
const montoParaPegar = (value: number) => value.toFixed(2).replace('.', ',');

/**
 * Lee lo que el usuario escribe como monto: "1.250,50", "1250,50", "1250.50",
 * "1.250". Devuelve null si no es un número positivo.
 */
function leerMonto(texto: string): number | null {
  let t = texto.replace(/[\s]|Bs\.?|USD|\$/gi, '').trim();
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const sinSeparadores = (value: string) => value.replace(/[\s.\-_/]/g, '');

/** Venezuela es UTC-4 todo el año. */
const OFFSET_CARACAS_MS = -4 * 60 * 60 * 1000;

/**
 * Medianoche local del día de Caracas de hace `dias` días. El servidor valida
 * la fecha del pago contra "hoy en Caracas": así "Hoy" no se adelanta un día
 * cuando el teléfono está en otra zona horaria (p. ej. quien paga por Zelle
 * desde el exterior).
 */
const diasAtras = (dias: number) => {
  const caracas = new Date(Date.now() + OFFSET_CARACAS_MS);
  return new Date(caracas.getUTCFullYear(), caracas.getUTCMonth(), caracas.getUTCDate() - dias);
};

export function PaymentFlow({
  cooperativaId,
  concepto,
  tipoRecurso,
  cotizacion,
  onRegistrar,
  onEfectivo,
  bloqueado = false,
}: PaymentFlowProps) {
  const toast = useToast();

  const [step, setStep] = useState<FlowStep>('metodos');
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [loadingMetodos, setLoadingMetodos] = useState(true);
  const [errorMetodos, setErrorMetodos] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);

  const [referencia, setReferencia] = useState('');
  const [fechaOpcion, setFechaOpcion] = useState<FechaOpcion>('hoy');
  const [fechaOtra, setFechaOtra] = useState<Date | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [banco, setBanco] = useState('');
  const [bancoSheetVisible, setBancoSheetVisible] = useState(false);
  const [bancoQuery, setBancoQuery] = useState('');
  const [montoTexto, setMontoTexto] = useState('');
  const [montoEditado, setMontoEditado] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CampoFormulario, string>>>({});

  /** M-25: anti doble toque. El estado llega tarde; la ref no. */
  const enviandoRef = useRef(false);
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // ── Cuentas de la cooperativa ────────────────────────────────────────────
  useEffect(() => {
    if (!cooperativaId) {
      setMetodos([]);
      setLoadingMetodos(false);
      return;
    }

    let isMounted = true;
    setLoadingMetodos(true);
    setErrorMetodos(null);

    const fallar = (error: unknown) => {
      if (__DEV__) console.error('[PaymentFlow] Error cargando métodos:', error);
      if (!isMounted) return;
      setErrorMetodos(humanizeError(error, 'pago'));
      setLoadingMetodos(false);
    };

    supabase
      .from('metodos_pago_cooperativa')
      .select('id, cooperativa_id, tipo, banco, titular, numero_cuenta, cedula_rif, email_zelle, instrucciones, activo')
      .eq('cooperativa_id', cooperativaId)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (error) return fallar(error);
        if (isMounted) {
          // El efectivo no se registra desde la app: se paga en taquilla.
          setMetodos(((data ?? []) as MetodoPago[]).filter((m) => m.tipo !== 'EFECTIVO'));
          setLoadingMetodos(false);
        }
      }, fallar);

    return () => {
      isMounted = false;
    };
  }, [cooperativaId, reintento]);

  const esBoleto = tipoRecurso === 'boleto';
  const isZelle = metodo?.tipo === 'ZELLE';
  const moneda: MonedaPago = isZelle ? 'USD' : 'VES';

  /** Sin tasa no hay monto en Bs: el servidor rechazaría el cobro (EB_TASA_NO_DISPONIBLE). */
  const sinTasa = !(Number(cotizacion.tasa) > 0) || cotizacion.totalBs == null;
  /** Lo que debería aparecer en la cuenta de la cooperativa, en la moneda del método. */
  const esperado = isZelle ? cotizacion.totalUsd : cotizacion.totalBs;
  const ocupado = submitting || bloqueado;

  // "Monto que pagaste" precargado con el monto exacto, salvo que el usuario lo cambie.
  useEffect(() => {
    if (montoEditado) return;
    setMontoTexto(esperado != null && esperado > 0 ? montoParaPegar(esperado) : '');
  }, [esperado, montoEditado]);

  const fechaPago = useMemo(() => {
    if (fechaOpcion === 'ayer') return diasAtras(1);
    if (fechaOpcion === 'otra' && fechaOtra) return fechaOtra;
    return diasAtras(0);
  }, [fechaOpcion, fechaOtra]);

  const bancosFiltrados = useMemo(() => {
    const q = normalizar(bancoQuery);
    if (!q) return BANCOS_VE;
    return BANCOS_VE.filter((b) =>
      normalizar(`${b.codigo} ${b.nombre} ${b.alias.join(' ')}`).includes(q)
    );
  }, [bancoQuery]);

  const limpiarError = (campo: CampoFormulario) =>
    setErrors((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const elegirMetodo = (option: MetodoPago) => {
    setMetodo(option);
    setErrors({});
    setMontoEditado(false);
    setStep('formulario');
  };

  const validate = (): boolean => {
    const next: Partial<Record<CampoFormulario, string>> = {};
    const ref = sinSeparadores(referencia.trim());
    if (isZelle) {
      if (!/^[A-Za-z0-9]{4,}$/.test(ref)) {
        next.referencia = 'Escribe el código de confirmación completo (mínimo 4 caracteres).';
      }
    } else if (!/^\d{4,}$/.test(ref)) {
      next.referencia = 'Escribe el número de referencia completo: solo números, mínimo 4.';
    }
    if (!isZelle && !banco.trim()) next.banco = 'Elige el banco desde el que pagaste.';
    if (leerMonto(montoTexto) === null) {
      next.monto = isZelle
        ? 'Escribe el monto que enviaste, por ejemplo 12,40.'
        : 'Escribe el monto que pagaste, por ejemplo 1250,00.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!metodo || enviandoRef.current || bloqueado || sinTasa) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    enviandoRef.current = true;
    setSubmitting(true);

    const ref = sinSeparadores(referencia.trim());
    const declarado: PagoDeclarado = {
      metodo_pago_id: metodo.id,
      numero_referencia: isZelle ? ref.toUpperCase() : ref,
      fecha_transaccion: toDateKey(fechaPago),
      banco_emisor: isZelle ? 'Zelle' : banco,
      monto_declarado: leerMonto(montoTexto),
    };

    try {
      await onRegistrar(declarado);
    } catch (err) {
      if (__DEV__) console.error('[PaymentFlow] Error registrando pago:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const mensaje = humanizeError(err, 'pago');
      const { campo } = parseDetalleEB(err);
      if (montadoRef.current && campo && CAMPOS_FORMULARIO.includes(campo)) {
        setErrors((prev) => ({ ...prev, [campo as CampoFormulario]: mensaje }));
        toast.show('error', mensaje);
      } else {
        toast.show('error', `No pudimos registrar tu pago; tus datos siguen aquí. ${mensaje}`);
      }
    } finally {
      enviandoRef.current = false;
      if (montadoRef.current) setSubmitting(false);
    }
  };

  if (loadingMetodos) {
    return (
      <Card padding="lg">
        <LoadingState label="Cargando formas de pago…" compact />
      </Card>
    );
  }

  // ─── Error al cargar los métodos (APP-30) ──────────────────────────────────
  if (errorMetodos) {
    return (
      <Card padding="md">
        <ErrorState
          compact
          title="No pudimos cargar las formas de pago"
          description={errorMetodos}
          onRetry={() => setReintento((n) => n + 1)}
        />
      </Card>
    );
  }

  const volver = (
    <PressableScale
      onPress={() => setStep('metodos')}
      disabled={submitting}
      scaleValue={Motion.press.button}
      style={s.back}
      accessibilityRole="button"
      accessibilityLabel="Volver a las formas de pago"
    >
      <ArrowLeft color={Colors.mutedForeground} size={Sizes.icon.sm} weight="bold" />
      <Text variant="caption" color="muted">
        Volver a las formas de pago
      </Text>
    </PressableScale>
  );

  // ─── Pagar en taquilla (solo boletos) ──────────────────────────────────────
  if (step === 'efectivo' && esBoleto && onEfectivo) {
    return (
      <Card padding="md">
        {volver}

        <Text variant="heading">Pagar en taquilla</Text>
        <Text variant="secondary" color="muted" style={s.subtitle}>
          Efectivo en la taquilla de la cooperativa
        </Text>

        <AmountBadge label="Monto a pagar en taquilla" cotizacion={cotizacion} moneda="VES" />

        <View style={[s.receipt, s.receiptHighlight, s.efectivoNote]}>
          <View style={s.efectivoTitle}>
            <Storefront color={Colors.primaryText} size={Sizes.icon.md} weight="fill" />
            <Text variant="bodyStrong">Cómo pagar en taquilla</Text>
          </View>
          <Text variant="secondary" color="muted">
            Tu asiento queda apartado 30 minutos. Paga en efectivo en la taquilla de la cooperativa
            antes de que venza la reserva; si no, el asiento se libera.
          </Text>
        </View>

        <Button
          variant="accent"
          fullWidth
          icon={Storefront}
          disabled={bloqueado}
          onPress={onEfectivo}
          style={s.submit}
        >
          Apartar y pagar en taquilla
        </Button>
      </Card>
    );
  }

  // ─── Paso 2: formulario ────────────────────────────────────────────────────
  if (step === 'formulario' && metodo) {
    const info = METODO_INFO[metodo.tipo] ?? { label: 'Pago', desc: '' };
    const isPagoMovil = metodo.tipo === 'PAGO_MOVIL';
    const bancoCuenta = metodo.banco ? bancoConCodigo(metodo.banco) : null;

    const filaMonto = isZelle
      ? { value: formatUsd(cotizacion.totalUsd), copy: cotizacion.totalUsd.toFixed(2) }
      : cotizacion.totalBs != null
        ? { value: formatBs(cotizacion.totalBs), copy: montoParaPegar(cotizacion.totalBs) }
        : null;

    const copiarTodo = isPagoMovil
      ? [
          'Pago Móvil',
          bancoCuenta ? `Banco: ${bancoCuenta}` : null,
          metodo.numero_cuenta ? `Teléfono: ${metodo.numero_cuenta}` : null,
          metodo.cedula_rif ? `C.I./RIF: ${metodo.cedula_rif}` : null,
          cotizacion.totalBs != null ? `Monto: ${formatBs(cotizacion.totalBs)}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      : null;

    return (
      <Card padding="md">
        {volver}

        <Text variant="heading">Registrar pago</Text>
        <Text variant="secondary" color="muted" style={s.subtitle}>
          {info.label}
        </Text>

        <AmountBadge
          label={isZelle ? 'Monto a enviar por Zelle' : 'Monto a transferir'}
          cotizacion={cotizacion}
          moneda={moneda}
          concepto={concepto}
        />

        {sinTasa ? <Aviso tono="warning" texto={AVISO_SIN_TASA} /> : null}

        <View style={s.accountBox}>
          <SectionLabel>Datos de la cuenta</SectionLabel>
          {bancoCuenta ? <AccountRow label="Banco" value={bancoCuenta} /> : null}
          {metodo.titular ? <AccountRow label="Titular" value={metodo.titular} /> : null}
          {isPagoMovil && metodo.numero_cuenta ? (
            <AccountRow
              label="Teléfono"
              value={metodo.numero_cuenta}
              copyValue={sinSeparadores(metodo.numero_cuenta)}
            />
          ) : null}
          {metodo.tipo === 'TRANSFERENCIA_BANCARIA' && metodo.numero_cuenta ? (
            <AccountRow
              label="Nro. de cuenta"
              value={metodo.numero_cuenta}
              copyValue={sinSeparadores(metodo.numero_cuenta)}
            />
          ) : null}
          {isZelle && metodo.email_zelle ? (
            <AccountRow label="Correo Zelle" value={metodo.email_zelle} />
          ) : null}
          {metodo.cedula_rif ? <AccountRow label="C.I. / RIF" value={metodo.cedula_rif} /> : null}
          {filaMonto ? (
            <AccountRow label="Monto" value={filaMonto.value} copyValue={filaMonto.copy} />
          ) : null}

          {copiarTodo ? <CopyAllButton value={copiarTodo} /> : null}

          {metodo.instrucciones ? (
            <Text variant="caption" color="muted" style={s.instructions}>
              {metodo.instrucciones}
            </Text>
          ) : null}
        </View>

        <Field
          label={isZelle ? 'Código de confirmación de Zelle' : 'Número de referencia'}
          placeholder={isZelle ? 'Ej. ABC123XYZ' : 'Ej. 012345678901'}
          helper={
            isZelle
              ? 'Aparece en el comprobante de Zelle. Escríbelo completo.'
              : 'Aparece en el comprobante de tu banco. Escríbelo completo, no solo los últimos dígitos.'
          }
          keyboardType={isZelle ? 'default' : 'number-pad'}
          autoCapitalize={isZelle ? 'characters' : 'none'}
          autoCorrect={false}
          tone="sunken"
          editable={!submitting}
          value={referencia}
          onChangeText={(v) => {
            setReferencia(v);
            limpiarError('referencia');
          }}
          error={errors.referencia}
        />

        <View style={s.fechaGroup}>
          <Text variant="label" style={s.fechaLabel}>
            ¿Cuándo hiciste el pago?
          </Text>
          <View style={s.fechaChips} accessibilityRole="radiogroup">
            <Chip
              label="Hoy"
              selected={fechaOpcion === 'hoy'}
              onPress={() => {
                setFechaOpcion('hoy');
                limpiarError('fecha');
              }}
            />
            <Chip
              label="Ayer"
              selected={fechaOpcion === 'ayer'}
              onPress={() => {
                setFechaOpcion('ayer');
                limpiarError('fecha');
              }}
            />
            <Chip
              label={
                fechaOpcion === 'otra' && fechaOtra
                  ? formatDateKey(toDateKey(fechaOtra))
                  : 'Otra fecha'
              }
              icon={CalendarBlank}
              selected={fechaOpcion === 'otra'}
              onPress={() => setCalendarVisible(true)}
            />
          </View>
          {errors.fecha ? (
            <Text variant="caption" color="dangerText" style={s.fechaHelper} accessibilityLiveRegion="polite">
              {errors.fecha}
            </Text>
          ) : (
            <Text variant="caption" color="muted" style={s.fechaHelper}>
              {`Fecha del pago: ${formatDateKey(toDateKey(fechaPago))}`}
            </Text>
          )}
        </View>

        {!isZelle && (
          <SelectField
            label="Banco desde el que pagaste"
            placeholder="Selecciona tu banco"
            icon={Bank}
            tone="sunken"
            value={banco}
            onPress={() => {
              if (submitting) return;
              setBancoQuery('');
              setBancoSheetVisible(true);
            }}
            error={errors.banco}
          />
        )}

        <Field
          label={`Monto que pagaste (${isZelle ? 'USD' : 'Bs'})`}
          placeholder={isZelle ? 'Ej. 12,40' : 'Ej. 1250,00'}
          helper="Ya está escrito el monto exacto. Cámbialo solo si pagaste otra cantidad."
          keyboardType="decimal-pad"
          autoCorrect={false}
          tone="sunken"
          editable={!submitting}
          value={montoTexto}
          onChangeText={(v) => {
            setMontoTexto(v);
            setMontoEditado(true);
            limpiarError('monto');
          }}
          error={errors.monto}
        />

        <Button
          variant="accent"
          fullWidth
          disabled={ocupado || sinTasa}
          onPress={handleSubmit}
          style={s.submit}
          accessibilityLabel={submitting ? 'Registrando tu pago' : 'Registrar pago'}
        >
          {submitting ? 'Registrando tu pago…' : 'Registrar pago'}
        </Button>
        <Text variant="caption" color="muted" align="center" style={s.submitHint}>
          La cooperativa revisará tu pago con su banco y te avisaremos cuando lo confirme.
        </Text>

        <CalendarModal
          visible={calendarVisible}
          onClose={() => setCalendarVisible(false)}
          title="¿Cuándo hiciste el pago?"
          value={fechaOtra ?? fechaPago}
          minimumDate={diasAtras(DIAS_ATRAS_MAX)}
          maximumDate={diasAtras(0)}
          onChange={(date) => {
            setFechaOtra(date);
            setFechaOpcion('otra');
            limpiarError('fecha');
          }}
        />

        <BottomSheet
          visible={bancoSheetVisible}
          onClose={() => setBancoSheetVisible(false)}
          title="Banco desde el que pagaste"
          height="70%"
        >
          <ScrollView
            contentContainerStyle={s.bancoList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              placeholder="Busca por nombre o código"
              icon={MagnifyingGlass}
              tone="sunken"
              value={bancoQuery}
              onChangeText={setBancoQuery}
              autoCorrect={false}
              returnKeyType="search"
            />

            {bancosFiltrados.length === 0 ? (
              <Text variant="caption" color="muted" style={s.bancoEmpty}>
                No encontramos ese banco. Si no está en la lista, elige «Otro banco».
              </Text>
            ) : null}

            {[
              ...bancosFiltrados.map((b) => ({
                value: bancoLabel(b),
                nombre: b.nombre,
                codigo: b.codigo as string | null,
              })),
              { value: OTRO_BANCO, nombre: OTRO_BANCO, codigo: null },
            ].map(({ value: option, nombre, codigo }) => {
              const selected = banco === option;

              return (
                <PressableScale
                  key={option}
                  onPress={() => {
                    setBanco(option);
                    limpiarError('banco');
                    setBancoSheetVisible(false);
                  }}
                  haptic
                  hapticType="selection"
                  scaleValue={Motion.press.card}
                  style={s.bancoRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={codigo ? `${nombre}, código ${codigo}` : nombre}
                >
                  <View style={s.bancoIcon}>
                    <Bank color={Colors.primaryText} weight="fill" size={Sizes.icon.md} />
                  </View>
                  <View style={s.bancoBody}>
                    <Text variant="bodyStrong" weight={selected ? 'bold' : 'medium'}>
                      {nombre}
                    </Text>
                    {codigo ? (
                      <Text variant="caption" color="muted">
                        {`Código ${codigo}`}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Check color={Colors.successText} size={Sizes.icon.md} weight="bold" />
                  ) : null}
                </PressableScale>
              );
            })}
          </ScrollView>
        </BottomSheet>
      </Card>
    );
  }

  // ─── Paso 1: elegir método ─────────────────────────────────────────────────
  const soloTaquilla = metodos.length === 0;
  const efectivoNavegable = esBoleto && !!onEfectivo;

  return (
    <Card padding="md">
      <Text variant="heading">¿Cómo vas a pagar?</Text>
      {concepto ? (
        <Text variant="secondary" color="muted" style={s.subtitle} numberOfLines={2}>
          {concepto}
        </Text>
      ) : null}

      <AmountBadge label="Total a pagar" cotizacion={cotizacion} moneda="VES" />

      {soloTaquilla ? (
        <Aviso tono="info" texto="Esta cooperativa solo acepta pago en taquilla." />
      ) : sinTasa ? (
        <Aviso tono="warning" texto={AVISO_SIN_TASA} />
      ) : null}

      <View style={s.metodos}>
        {metodos.map((option) => {
          const info = METODO_INFO[option.tipo] ?? {
            label: option.tipo,
            desc: 'Cuenta de la cooperativa',
          };
          const deshabilitado = sinTasa || bloqueado;

          return (
            <PressableScale
              key={option.id}
              onPress={() => elegirMetodo(option)}
              disabled={deshabilitado}
              haptic
              hapticType="selection"
              scaleValue={Motion.press.card}
              style={s.metodoCard}
              accessibilityRole="button"
              accessibilityState={{ disabled: deshabilitado }}
              accessibilityLabel={`${info.label}. ${info.desc}`}
            >
              <View style={s.metodoIcon}>
                <CreditCard color={Colors.primaryText} weight="fill" size={Sizes.icon.lg} />
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

        {efectivoNavegable ? (
          <PressableScale
            onPress={() => setStep('efectivo')}
            disabled={bloqueado}
            haptic
            hapticType="selection"
            scaleValue={Motion.press.card}
            style={s.metodoCard}
            accessibilityRole="button"
            accessibilityState={{ disabled: bloqueado }}
            accessibilityLabel="Apartar y pagar en taquilla. Pagas en efectivo en la taquilla de la cooperativa."
          >
            <View style={s.metodoIcon}>
              <Money color={Colors.primaryText} weight="fill" size={Sizes.icon.lg} />
            </View>
            <View style={s.metodoBody}>
              <Text variant="bodyStrong">Apartar y pagar en taquilla</Text>
              <Text variant="caption" color="muted" numberOfLines={2}>
                Pagas en efectivo en la taquilla de la cooperativa
              </Text>
            </View>
          </PressableScale>
        ) : (
          <View style={[s.receipt, s.efectivoInfo]}>
            <View style={s.efectivoTitle}>
              <Storefront color={Colors.primaryText} size={Sizes.icon.md} weight="fill" />
              <Text variant="bodyStrong">¿Prefieres pagar en efectivo?</Text>
            </View>
            <Text variant="secondary" color="muted">
              {esBoleto
                ? 'Acércate a la taquilla de la cooperativa antes de que venza tu reserva. El taquillero registra el pago en el momento.'
                : 'Paga en la taquilla de la cooperativa. El taquillero registra el pago en el momento y el envío continúa.'}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

function Aviso({ tono, texto }: { tono: 'info' | 'warning'; texto: string }) {
  const warning = tono === 'warning';
  const Icon = warning ? WarningCircle : Info;
  return (
    <View
      style={[s.notice, warning && s.noticeWarning]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon size={Sizes.icon.md} color={warning ? Colors.warningText : Colors.infoText} weight="fill" />
      <Text variant="secondary" style={s.noticeText}>
        {texto}
      </Text>
    </View>
  );
}

// ─── Amount badge ────────────────────────────────────────────────────────────

/**
 * APP-24 / APP-28: el monto va en `foreground` (nunca amarillo sobre amarillo)
 * y la referencia en la otra moneda se ve siempre, con la fecha de la tasa BCV.
 * En Zelle (`moneda="USD"`) el USD es lo que se envía y pasa a ser el dato grande.
 */
function AmountBadge({
  label,
  cotizacion,
  moneda,
  concepto,
}: {
  label: string;
  cotizacion: CotizacionPago;
  moneda: MonedaPago;
  concepto?: string;
}) {
  const tasa = tasaRefDe(cotizacion.tasa, cotizacion.tasaFecha);
  const monto = formatMoney({ usd: cotizacion.totalUsd, bs: cotizacion.totalBs, tasa, moneda });

  return (
    <View style={s.amount} accessible accessibilityLabel={`${label}: ${monto.accesible}`}>
      <Text variant="overline" color="muted" uppercase>
        {label}
      </Text>
      <Text variant="display" size="3xl" color="foreground" compact style={s.amountValue}>
        {monto.principal}
      </Text>

      {monto.secundario ? (
        <Text variant="subheading" color="muted" compact align="center">
          {monto.secundario}
        </Text>
      ) : null}

      {tasa ? (
        <View style={s.amountHint}>
          <Info size={Sizes.icon.xs} color={Colors.mutedForeground} weight="fill" />
          <Text variant="caption" size="xs" color="muted" align="center" style={s.amountHintText}>
            {`Tasa BCV del ${formatDateKey(tasa.fecha)}: ${formatNumeroVE(tasa.tasa)} Bs/USD`}
          </Text>
        </View>
      ) : null}

      {concepto ? (
        <Text variant="caption" color="muted" align="center" numberOfLines={2}>
          {concepto}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Datos de la cuenta ──────────────────────────────────────────────────────

/** APP-25 / M-24: el valor admite 2 líneas y cada dato se copia con un toque. */
function AccountRow({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  /** What goes to the clipboard when it differs from what is shown */
  copyValue?: string;
}) {
  return (
    <View style={s.accountRow}>
      <View style={s.accountBody}>
        <Text variant="caption" color="muted">
          {label}
        </Text>
        <Text variant="bodyStrong" size="sm" numberOfLines={2} selectable>
          {value}
        </Text>
      </View>
      <CopyButton value={copyValue ?? value} label={label} />
    </View>
  );
}

/** Copies `value` and shows "Copiado" for a moment; `anuncio` is read by the screen reader. */
function useCopiar(anuncio: string) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(timer);
  }, [copiado]);

  const copiar = async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopiado(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(anuncio);
    } catch (err) {
      if (__DEV__) console.error('[PaymentFlow] Error copiando:', err);
      toast.show('error', 'No pudimos copiar el dato. Mantén presionado el texto para copiarlo.');
    }
  };

  return { copiado, copiar };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { copiado, copiar } = useCopiar(`${label} copiado`);

  return (
    <PressableScale
      onPress={() => copiar(value)}
      scaleValue={Motion.press.button}
      style={[s.copy, copiado && s.copyDone]}
      accessibilityRole="button"
      accessibilityLabel={copiado ? `${label} copiado` : `Copiar ${label}`}
    >
      {copiado ? (
        <Check color={Colors.successText} size={Sizes.icon.sm} weight="bold" />
      ) : (
        <Copy color={Colors.infoText} size={Sizes.icon.sm} weight="bold" />
      )}
      <Text variant="caption" weight="bold" color={copiado ? 'successText' : 'infoText'} compact>
        {copiado ? 'Copiado' : 'Copiar'}
      </Text>
    </PressableScale>
  );
}

function CopyAllButton({ value }: { value: string }) {
  const { copiado, copiar } = useCopiar('Datos del Pago Móvil copiados');

  return (
    <Button
      variant="outline"
      size="md"
      fullWidth
      icon={copiado ? Check : Copy}
      onPress={() => copiar(value)}
      style={s.copyAll}
      accessibilityLabel={copiado ? 'Datos del Pago Móvil copiados' : 'Copiar todos los datos del Pago Móvil'}
    >
      {copiado ? 'Copiado' : 'Copiar todo'}
    </Button>
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
    minHeight: Sizes.touchTarget,
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
    marginTop: Spacing.xs,
  },
  amountHintText: {
    flexShrink: 1,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.infoLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  noticeWarning: {
    backgroundColor: Colors.warningLight,
  },
  noticeText: {
    flex: 1,
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
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  accountBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minWidth: Sizes.touchTarget,
    minHeight: Sizes.touchTarget,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
  copyDone: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.successLight,
  },
  copyAll: {
    marginTop: Spacing.md,
  },
  instructions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
    fontStyle: 'italic',
  },

  fechaGroup: {
    marginBottom: Spacing.lg,
  },
  fechaLabel: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  fechaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  fechaHelper: {
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
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
  efectivoInfo: {
    marginBottom: 0,
  },
  efectivoTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  submit: {
    marginTop: Spacing.md,
  },
  submitHint: {
    marginTop: Spacing.sm,
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
  bancoEmpty: {
    marginBottom: Spacing.md,
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
  bancoBody: {
    flex: 1,
  },
});
