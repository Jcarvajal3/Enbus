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
 *   encomiendas → solo un aviso.
 *
 * Tocar una forma de pago la elige; el botón ("Continuar") la abre (§2.1
 * regla 6). Tres modos:
 * - Por defecto (encomiendas): tarjeta propia con su título, sus botones y el
 *   enlace para volver a las formas de pago.
 * - Controlado (`metodo` + `onMetodo`): la pantalla guarda el subpaso y su ←
 *   lo cierra primero (AN-12); el título va en la cabecera de la pantalla.
 * - `embebido`: sin tarjeta, dentro de una hoja (el título y la ← van en la
 *   hoja, AU-20).
 * Con `onAccion`, el botón del subpaso no se dibuja: se entrega a la pantalla
 * para su `FloatingBar` o el pie de la hoja.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import {
  ArrowLeft,
  Bank,
  CalendarBlank,
  Check,
  CheckCircle,
  Copy,
  CurrencyDollar,
  DeviceMobile,
  Info,
  MagnifyingGlass,
  Money,
  Storefront,
  WarningCircle,
  type IconProps,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { PressableScale } from './PressableScale';
import { CalendarModal } from './CalendarModal';
import { SkeletonLoader } from './SkeletonLoader';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  IconButton,
  SectionLabel,
  SelectField,
  Text,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { formatDiaVE, toDateKey } from '@/src/utils/formatters';
import {
  formatBs,
  formatMoney,
  formatNumeroVE,
  formatUsd,
  tasaRefDe,
  type MonedaPago,
} from '@/src/utils/dinero';
import type { CotizacionPago, MetodoPago, PagoDeclarado } from '@/src/types';
import type { TasaCambiada } from '@/src/hooks/useCheckoutBoletos';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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

// ─── Formas de pago ──────────────────────────────────────────────────────────

/** Un icono por método (AU-31): no se repite el mismo en todas las filas. */
const METODO_INFO: Record<string, { label: string; desc: string; icono: React.ComponentType<IconProps> }> = {
  PAGO_MOVIL: { label: 'Pago Móvil', desc: 'En bolívares, al instante', icono: DeviceMobile },
  TRANSFERENCIA_BANCARIA: { label: 'Transferencia', desc: 'Desde tu cuenta en Venezuela', icono: Bank },
  ZELLE: { label: 'Zelle', desc: 'En dólares', icono: CurrencyDollar },
};

const TAQUILLA = {
  label: 'Apartar y pagar en taquilla',
  desc: 'En efectivo, en la taquilla de la cooperativa',
  icono: Money,
};

/** Subpaso abierto: una cuenta de la cooperativa o la taquilla. */
export type MetodoElegido = MetodoPago | 'efectivo';

/** Título del subpaso para la cabecera o la hoja: "Pago Móvil", "Pagar en taquilla". */
export function tituloMetodo(metodo: MetodoElegido | null | undefined): string | null {
  if (!metodo) return null;
  if (metodo === 'efectivo') return 'Pagar en taquilla';
  return METODO_INFO[metodo.tipo]?.label ?? 'Registrar pago';
}

/** El botón del subpaso, para la `FloatingBar` o el pie de una hoja. */
export interface AccionPago {
  etiqueta: string;
  icon?: React.ComponentType<IconProps>;
  onPress: () => void;
  disabled: boolean;
  cargando: boolean;
}

/** APP-26 / M-20: the payment date is picked, never typed. */
type FechaOpcion = 'hoy' | 'ayer' | 'otra';

/** How far back "Otra fecha" lets the user go (same limit as the server). */
const DIAS_ATRAS_MAX = 30;

/** Campos del formulario que el servidor puede señalar en `details.campo`. */
type CampoFormulario = 'referencia' | 'banco' | 'fecha' | 'monto';
const CAMPOS_FORMULARIO: readonly string[] = ['referencia', 'banco', 'fecha', 'monto'];

const AVISO_SIN_TASA =
  'Aún no tenemos la tasa BCV de hoy para calcular el monto en bolívares. Intenta en unos minutos o paga en la taquilla.';

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
  /**
   * Subpaso controlado por la pantalla: `null` = elegir la forma de pago. Si
   * se pasa, la ← de la pantalla lo cierra (`onMetodo(null)`) y no hay enlace
   * interno para volver.
   */
  metodo?: MetodoElegido | null;
  onMetodo?: (metodo: MetodoElegido | null) => void;
  /** Dentro de una hoja: sin tarjeta ni título propio */
  embebido?: boolean;
  /** Recibe el botón del subpaso (o `null`) en vez de dibujarlo */
  onAccion?: (accion: AccionPago | null) => void;
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

/** Clave de una opción de la lista: el id de la cuenta o 'efectivo'. */
const claveDe = (m: MetodoElegido) => (m === 'efectivo' ? 'efectivo' : m.id);

export function PaymentFlow({
  cooperativaId,
  concepto,
  tipoRecurso,
  cotizacion,
  onRegistrar,
  onEfectivo,
  bloqueado = false,
  metodo: metodoControlado,
  onMetodo,
  embebido = false,
  onAccion,
}: PaymentFlowProps) {
  const toast = useToast();
  const controlado = metodoControlado !== undefined;
  /** Con tarjeta propia (sin pantalla que lo controle ni hoja que lo contenga). */
  const enTarjeta = !controlado && !embebido;

  const [metodoLocal, setMetodoLocal] = useState<MetodoElegido | null>(null);
  const abierto = controlado ? metodoControlado : metodoLocal;
  const abrir = (m: MetodoElegido | null) => {
    if (controlado) onMetodo?.(m);
    else setMetodoLocal(m);
  };

  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [loadingMetodos, setLoadingMetodos] = useState(true);
  const [errorMetodos, setErrorMetodos] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);
  /** Opción marcada en la lista (aún sin abrir) */
  const [candidato, setCandidato] = useState<string | null>(null);

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
  const metodo = abierto && abierto !== 'efectivo' ? abierto : null;
  const isZelle = metodo?.tipo === 'ZELLE';
  const moneda: MonedaPago = isZelle ? 'USD' : 'VES';
  const efectivoNavegable = esBoleto && !!onEfectivo;

  /** Sin tasa no hay monto en Bs: el servidor rechazaría el cobro (EB_TASA_NO_DISPONIBLE). */
  const sinTasa = !(Number(cotizacion.tasa) > 0) || cotizacion.totalBs == null;
  /** Lo que debería aparecer en la cuenta de la cooperativa, en la moneda del método. */
  const esperado = isZelle ? cotizacion.totalUsd : cotizacion.totalBs;
  const ocupado = submitting || bloqueado;

  // Otra cuenta abierta: el formulario empieza limpio, con el monto exacto.
  const metodoId = metodo?.id ?? null;
  useEffect(() => {
    setErrors({});
    setMontoEditado(false);
  }, [metodoId]);

  // Al volver a la lista, la opción que estaba abierta sigue marcada.
  useEffect(() => {
    if (abierto) setCandidato(claveDe(abierto));
  }, [abierto]);

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

  // ── El botón del subpaso ─────────────────────────────────────────────────
  const opcionCandidata: MetodoElegido | null =
    candidato === 'efectivo' && efectivoNavegable
      ? 'efectivo'
      : (metodos.find((m) => m.id === candidato) ?? null);

  let accion: AccionPago | null = null;
  if (!loadingMetodos && !errorMetodos) {
    if (abierto === 'efectivo' && efectivoNavegable) {
      accion = {
        etiqueta: 'Apartar y pagar en taquilla',
        icon: Storefront,
        onPress: () => onEfectivo?.(),
        disabled: bloqueado,
        cargando: false,
      };
    } else if (metodo) {
      accion = {
        etiqueta: 'Registrar pago',
        onPress: () => void handleSubmit(),
        disabled: ocupado || sinTasa,
        cargando: submitting,
      };
    } else if (metodos.length > 0 || efectivoNavegable) {
      accion = {
        etiqueta: 'Continuar',
        onPress: () => {
          if (opcionCandidata) abrir(opcionCandidata);
        },
        disabled: !opcionCandidata || bloqueado,
        cargando: false,
      };
    }
  }

  // La pantalla recibe un `onPress` estable que llama siempre al último.
  const accionRef = useRef(accion);
  accionRef.current = accion;
  const onAccionRef = useRef(onAccion);
  onAccionRef.current = onAccion;
  const firma = accion
    ? `${accion.etiqueta}|${accion.disabled}|${accion.cargando}|${accion.icon ? 1 : 0}`
    : '';
  useEffect(() => {
    const actual = accionRef.current;
    onAccionRef.current?.(
      actual ? { ...actual, onPress: () => accionRef.current?.onPress() } : null
    );
  }, [firma]);
  useEffect(() => () => onAccionRef.current?.(null), []);

  const botonPropio = accion && !onAccion ? (
    <Button
      fullWidth
      icon={accion.icon}
      disabled={accion.disabled}
      loading={accion.cargando}
      onPress={accion.onPress}
      style={s.submit}
      accessibilityLabel={accion.cargando ? 'Registrando tu pago' : accion.etiqueta}
    >
      {accion.etiqueta}
    </Button>
  ) : null;

  /** Cajas internas: `surface` sobre fondo blanco; blancas dentro de la tarjeta beige. */
  const caja = enTarjeta ? s.cajaEnTarjeta : s.cajaEnFondo;
  const tonoCampo = enTarjeta ? 'light' : 'sunken';

  // Una función (no un componente): así el contenido no se vuelve a montar en cada render.
  const envolver = (contenido: React.ReactNode) =>
    enTarjeta ? (
      <Card tone="sunken" padding="md">
        {contenido}
      </Card>
    ) : (
      <View>{contenido}</View>
    );

  // ─── Cargando / error ──────────────────────────────────────────────────────
  if (loadingMetodos) {
    return envolver(
      <>
        <View style={s.esqueleto} accessibilityRole="progressbar" accessibilityLabel="Cargando formas de pago">
          <SkeletonLoader height={Sizes.iconBox['2xl']} borderRadius={Radius.lg} />
          {[0, 1, 2].map((i) => (
            <SkeletonLoader key={i} height={Sizes.control.xl} borderRadius={Radius.lg} index={i + 1} />
          ))}
        </View>
      </>
    );
  }

  // APP-30
  if (errorMetodos) {
    return envolver(
      <>
        <ErrorState
          compact
          title="No pudimos cargar las formas de pago"
          description={errorMetodos}
          onRetry={() => setReintento((n) => n + 1)}
        />
      </>
    );
  }

  /** Enlace para volver a la lista: solo con tarjeta propia (si no, es la ← de la pantalla o la hoja). */
  const volver = enTarjeta ? (
    <PressableScale
      onPress={() => abrir(null)}
      disabled={submitting}
      scaleValue={Motion.press.button}
      style={s.back}
      accessibilityRole="button"
      accessibilityLabel="Volver a las formas de pago"
    >
      <ArrowLeft color={Colors.foreground} size={Sizes.icon.md} weight="bold" />
      <Text variant="label">Formas de pago</Text>
    </PressableScale>
  ) : null;

  // ─── Pagar en taquilla (solo boletos) ──────────────────────────────────────
  if (abierto === 'efectivo' && efectivoNavegable) {
    return envolver(
      <>
        {volver}
        {enTarjeta ? <Text variant="heading" style={s.titulo}>Pagar en taquilla</Text> : null}

        <AmountBadge label="Monto a pagar en taquilla" cotizacion={cotizacion} moneda="VES" />

        <Aviso
          tono="info"
          texto="Tu asiento queda apartado 30 minutos. Paga en efectivo en la taquilla antes de que venza la reserva."
        />

        {botonPropio}
      </>
    );
  }

  // ─── Formulario ────────────────────────────────────────────────────────────
  if (metodo) {
    const info = METODO_INFO[metodo.tipo] ?? { label: 'Pago', desc: '', icono: Bank };
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

    const fondoCopiar = enTarjeta ? 'surface' : 'inverse';

    return envolver(
      <>
        {volver}
        {enTarjeta ? <Text variant="heading" style={s.titulo}>{info.label}</Text> : null}

        <AmountBadge
          label={isZelle ? 'Monto a enviar por Zelle' : 'Monto a transferir'}
          cotizacion={cotizacion}
          moneda={moneda}
          concepto={concepto}
        />

        {sinTasa ? <Aviso tono="warning" texto={AVISO_SIN_TASA} /> : null}

        <SectionLabel>Datos de la cuenta</SectionLabel>
        <View style={[s.cuenta, caja]}>
          {bancoCuenta ? <AccountRow label="Banco" value={bancoCuenta} fondo={fondoCopiar} /> : null}
          {metodo.titular ? <AccountRow label="Titular" value={metodo.titular} fondo={fondoCopiar} /> : null}
          {isPagoMovil && metodo.numero_cuenta ? (
            <AccountRow
              label="Teléfono"
              value={metodo.numero_cuenta}
              copyValue={sinSeparadores(metodo.numero_cuenta)}
              fondo={fondoCopiar}
            />
          ) : null}
          {metodo.tipo === 'TRANSFERENCIA_BANCARIA' && metodo.numero_cuenta ? (
            <AccountRow
              label="Número de cuenta"
              value={metodo.numero_cuenta}
              copyValue={sinSeparadores(metodo.numero_cuenta)}
              fondo={fondoCopiar}
            />
          ) : null}
          {isZelle && metodo.email_zelle ? (
            <AccountRow label="Correo Zelle" value={metodo.email_zelle} fondo={fondoCopiar} />
          ) : null}
          {metodo.cedula_rif ? (
            <AccountRow label="C.I. / RIF" value={metodo.cedula_rif} fondo={fondoCopiar} />
          ) : null}
          {filaMonto ? (
            <AccountRow
              label="Monto"
              value={filaMonto.value}
              copyValue={filaMonto.copy}
              fondo={fondoCopiar}
            />
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
          helper="Complétalo, no solo los últimos dígitos."
          keyboardType={isZelle ? 'default' : 'number-pad'}
          autoCapitalize={isZelle ? 'characters' : 'none'}
          autoCorrect={false}
          tone={tonoCampo}
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
            Fecha del pago
          </Text>
          <View style={s.fechaChips} accessibilityRole="radiogroup">
            <Chip
              label="Hoy"
              sobre={enTarjeta ? 'surface' : 'background'}
              selected={fechaOpcion === 'hoy'}
              onPress={() => {
                setFechaOpcion('hoy');
                limpiarError('fecha');
              }}
            />
            <Chip
              label="Ayer"
              sobre={enTarjeta ? 'surface' : 'background'}
              selected={fechaOpcion === 'ayer'}
              onPress={() => {
                setFechaOpcion('ayer');
                limpiarError('fecha');
              }}
            />
            <Chip
              label={fechaOpcion === 'otra' && fechaOtra ? formatDiaVE(fechaOtra) : 'Otra fecha'}
              icon={CalendarBlank}
              sobre={enTarjeta ? 'surface' : 'background'}
              selected={fechaOpcion === 'otra'}
              onPress={() => setCalendarVisible(true)}
            />
          </View>
          {errors.fecha ? (
            <Text variant="caption" color="dangerText" style={s.fechaHelper} accessibilityLiveRegion="polite">
              {errors.fecha}
            </Text>
          ) : null}
        </View>

        {!isZelle && (
          <SelectField
            label="Banco desde el que pagaste"
            placeholder="Elige tu banco"
            icon={Bank}
            tone={tonoCampo}
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
          helper="Cámbialo solo si pagaste otro monto."
          keyboardType="decimal-pad"
          autoCorrect={false}
          tone={tonoCampo}
          editable={!submitting}
          value={montoTexto}
          onChangeText={(v) => {
            setMontoTexto(v);
            setMontoEditado(true);
            limpiarError('monto');
          }}
          error={errors.monto}
          containerStyle={s.ultimoCampo}
        />

        {botonPropio}

        <CalendarModal
          visible={calendarVisible}
          onClose={() => setCalendarVisible(false)}
          title="Fecha del pago"
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
              placeholder="Ej. Banesco o 0134"
              icon={MagnifyingGlass}
              tone="sunken"
              value={bancoQuery}
              onChangeText={setBancoQuery}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Buscar banco"
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={codigo ? `${nombre}, código ${codigo}` : nombre}
                >
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
                    <CheckCircle color={Colors.accentStrong} size={Sizes.icon.lg} weight="fill" />
                  ) : null}
                </PressableScale>
              );
            })}
          </ScrollView>
        </BottomSheet>
      </>
    );
  }

  // ─── Elegir la forma de pago ───────────────────────────────────────────────
  const soloTaquilla = metodos.length === 0;

  const opciones: { clave: string; label: string; desc: string; icono: React.ComponentType<IconProps>; deshabilitada: boolean }[] = [
    ...metodos.map((m) => {
      const info = METODO_INFO[m.tipo] ?? { label: m.tipo, desc: 'Cuenta de la cooperativa', icono: Bank };
      return {
        clave: m.id,
        label: info.label,
        desc: m.banco ? `${m.banco} · ${info.desc}` : info.desc,
        icono: info.icono,
        deshabilitada: sinTasa || bloqueado,
      };
    }),
    ...(efectivoNavegable
      ? [{ clave: 'efectivo', label: TAQUILLA.label, desc: TAQUILLA.desc, icono: TAQUILLA.icono, deshabilitada: bloqueado }]
      : []),
  ];

  return envolver(
    <>
      {enTarjeta ? (
        <>
          <Text variant="heading">¿Cómo vas a pagar?</Text>
          {concepto ? (
            <Text variant="secondary" color="muted" style={s.concepto} numberOfLines={2}>
              {concepto}
            </Text>
          ) : null}
        </>
      ) : null}

      <AmountBadge label="Total a pagar" cotizacion={cotizacion} moneda="VES" />

      {soloTaquilla ? (
        <Aviso tono="info" texto="Esta cooperativa solo acepta pago en taquilla." />
      ) : sinTasa ? (
        <Aviso tono="warning" texto={AVISO_SIN_TASA} />
      ) : null}

      <View style={s.metodos} accessibilityRole="radiogroup" accessibilityLabel="Forma de pago">
        {opciones.map((o) => {
          const elegida = candidato === o.clave;
          return (
            <PressableScale
              key={o.clave}
              onPress={() => setCandidato(o.clave)}
              disabled={o.deshabilitada}
              dimWhenDisabled={false}
              haptic
              hapticType="selection"
              scaleValue={Motion.press.card}
              style={[s.metodo, caja, elegida && s.metodoElegido]}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegida, disabled: o.deshabilitada }}
              accessibilityLabel={`${o.label}. ${o.desc}`}
            >
              <View style={[s.metodoIcono, enTarjeta ? s.metodoIconoEnTarjeta : s.metodoIconoEnFondo]}>
                <o.icono
                  color={o.deshabilitada ? Colors.mutedForeground : Colors.foreground}
                  weight="bold"
                  size={Sizes.icon.md}
                />
              </View>
              <View style={s.metodoBody}>
                <Text variant="bodyStrong" color={o.deshabilitada ? 'muted' : 'foreground'}>
                  {o.label}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={2}>
                  {o.desc}
                </Text>
              </View>
              {elegida ? (
                <CheckCircle size={Sizes.icon.lg} color={Colors.accentStrong} weight="fill" />
              ) : null}
            </PressableScale>
          );
        })}

        {!efectivoNavegable ? (
          <Aviso
            tono="info"
            icono={Storefront}
            texto={
              esBoleto
                ? 'También puedes pagar en efectivo en la taquilla antes de que venza tu reserva.'
                : 'También puedes pagar en efectivo en la taquilla de la cooperativa.'
            }
          />
        ) : null}
      </View>

      {botonPropio}
    </>
  );
}

// ─── La tasa BCV cambió ──────────────────────────────────────────────────────

/** Texto del aviso `EB_TASA_CAMBIO` (hoja en la compra y en el detalle). */
export function textoTasaCambiada(cambio: TasaCambiada): string {
  const antes = cambio.anteriorBs != null ? ` (antes ${formatBs(cambio.anteriorBs)})` : '';
  return `El total ahora es ${formatBs(cambio.nuevoBs)}${antes}. Si ya pagaste el monto anterior, regístralo igual: la cooperativa verá la diferencia.`;
}

/**
 * `EB_TASA_CAMBIO`: la tasa BCV cambió entre la cotización y el registro.
 * "Registrar con el nuevo total" reintenta con lo que el usuario declaró;
 * "Revisar" vuelve al formulario, que ya muestra el total nuevo.
 */
export function TasaCambiadaSheet({
  cambio,
  enviando,
  onConfirmar,
  onRevisar,
}: {
  cambio: TasaCambiada | null;
  enviando: boolean;
  onConfirmar: () => void;
  onRevisar: () => void;
}) {
  return (
    <BottomSheet
      visible={cambio !== null}
      onClose={() => {
        if (!enviando) onRevisar();
      }}
      title="La tasa BCV cambió"
      footer={<BotonesTasaCambiada enviando={enviando} onConfirmar={onConfirmar} onRevisar={onRevisar} />}
    >
      <View style={s.sheetBody}>
        <Text variant="body">{cambio ? textoTasaCambiada(cambio) : ''}</Text>
      </View>
    </BottomSheet>
  );
}

export function BotonesTasaCambiada({
  enviando,
  onConfirmar,
  onRevisar,
}: {
  enviando: boolean;
  onConfirmar: () => void;
  onRevisar: () => void;
}) {
  return (
    <View style={s.sheetButtons}>
      <Button fullWidth loading={enviando} onPress={onConfirmar}>
        Registrar con el nuevo total
      </Button>
      <Button variant="ghost" fullWidth disabled={enviando} onPress={onRevisar}>
        Revisar
      </Button>
    </View>
  );
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

function Aviso({
  tono,
  texto,
  icono,
}: {
  tono: 'info' | 'warning';
  texto: string;
  icono?: React.ComponentType<IconProps>;
}) {
  const warning = tono === 'warning';
  const Icon = icono ?? (warning ? WarningCircle : Info);
  return (
    <View
      style={[s.notice, warning && s.noticeWarning]}
      accessibilityRole={warning ? 'alert' : undefined}
      accessibilityLiveRegion={warning ? 'polite' : undefined}
    >
      <Icon size={Sizes.icon.lg} color={warning ? Colors.warningText : Colors.infoText} weight="fill" />
      <Text variant="secondary" style={s.noticeText}>
        {texto}
      </Text>
    </View>
  );
}

// ─── Monto ───────────────────────────────────────────────────────────────────

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
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="display" size="3xl" color="foreground" compact style={s.amountValue}>
        {monto.principal}
      </Text>
      {monto.secundario ? (
        <Text variant="secondary" color="muted" align="center">
          {monto.secundario}
        </Text>
      ) : null}
      {tasa ? (
        <Text variant="caption" color="muted" align="center">
          {`Tasa BCV ${formatNumeroVE(tasa.tasa)} Bs/USD · ${formatDiaVE(tasa.fecha)}`}
        </Text>
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

/** APP-25 / M-24: el valor admite 2 líneas y cada dato se copia con un toque (AU-32: icono). */
function AccountRow({
  label,
  value,
  copyValue,
  fondo,
}: {
  label: string;
  value: string;
  /** What goes to the clipboard when it differs from what is shown */
  copyValue?: string;
  fondo: 'surface' | 'inverse';
}) {
  const { copiado, copiar } = useCopiar(`${label} copiado`);
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
      <IconButton
        icon={copiado ? Check : Copy}
        variant={fondo}
        color={copiado ? Colors.successText : Colors.foreground}
        label={copiado ? `${label} copiado` : `Copiar ${label}`}
        onPress={() => void copiar(copyValue ?? value)}
      />
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

function CopyAllButton({ value }: { value: string }) {
  const { copiado, copiar } = useCopiar('Datos del Pago Móvil copiados');

  return (
    <Button
      variant="outline"
      size="md"
      fullWidth
      icon={copiado ? Check : Copy}
      onPress={() => void copiar(value)}
      style={s.copyAll}
      accessibilityLabel={copiado ? 'Datos del Pago Móvil copiados' : 'Copiar todos los datos del Pago Móvil'}
    >
      {copiado ? 'Copiado' : 'Copiar todo'}
    </Button>
  );
}

const s = StyleSheet.create({
  titulo: {
    marginBottom: Spacing.lg,
  },
  concepto: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    minHeight: Sizes.touchTarget,
    marginBottom: Spacing.xs,
  },
  esqueleto: {
    gap: Spacing.md,
  },

  cajaEnFondo: {
    backgroundColor: Colors.surface,
  },
  cajaEnTarjeta: {
    backgroundColor: Colors.background,
  },

  amount: {
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  amountValue: {
    marginVertical: Spacing.xs,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.infoLight,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  noticeWarning: {
    backgroundColor: Colors.warningLight,
  },
  noticeText: {
    flex: 1,
  },

  cuenta: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
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
    gap: Spacing.xs,
  },
  copyAll: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  instructions: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },

  fechaGroup: {
    marginBottom: Spacing.lg,
  },
  fechaLabel: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xl,
  },
  fechaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  fechaHelper: {
    marginTop: Spacing.sm,
    marginLeft: Spacing.xl,
  },
  ultimoCampo: {
    marginBottom: 0,
  },

  submit: {
    marginTop: Spacing.xl,
  },

  metodos: {
    gap: Spacing.md,
  },
  metodo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    // El borde existe siempre (transparente) para que elegir no mueva nada.
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.transparent,
  },
  metodoElegido: {
    backgroundColor: Colors.background,
    borderColor: Colors.accentStrong,
  },
  metodoIcono: {
    width: Sizes.iconBox.lg,
    height: Sizes.iconBox.lg,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metodoIconoEnFondo: {
    backgroundColor: Colors.background,
  },
  metodoIconoEnTarjeta: {
    backgroundColor: Colors.surface,
  },
  metodoBody: {
    flex: 1,
    gap: Spacing.xs,
  },

  bancoList: {
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.lg,
  },
  bancoEmpty: {
    marginBottom: Spacing.md,
  },
  bancoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    minHeight: Sizes.control.xl,
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  bancoBody: {
    flex: 1,
  },

  sheetBody: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  sheetButtons: {
    gap: Spacing.sm,
  },
});
