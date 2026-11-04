import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bus,
  Camera,
  Image as ImageIcon,
  Info,
  Package,
  Prohibit,
  Star,
  Warning,
  type IconProps,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { RouteField } from '@/src/components/RouteField';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { SkeletonLoader } from '@/src/components/SkeletonLoader';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import { CedulaField } from '@/src/components/CedulaField';
import { TelefonoField } from '@/src/components/TelefonoField';
import {
  Aviso,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  EntityCard,
  ErrorState,
  Field,
  EvitarTeclado,
  FloatingBar,
  IconTile,
  Monto,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  TextLink,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { uploadEvidencePhoto } from '@/src/utils/storage';
import { nuevaClaveIdempotencia } from '@/src/utils/ids';
import { codigoEB, humanizeError } from '@/src/utils/errores';
import { useWizardBack } from '@/src/hooks/useWizardBack';
import { usePerfil } from '@/src/hooks/usePerfil';
import { cargarSucursalesCiudad } from '@/src/hooks/useEncomiendas';
import { formatMoney, formatNumeroVE, formatUsd, tasaRefDe } from '@/src/utils/dinero';
import { MODALIDAD_PAGO } from '@/src/utils/estados';
import { ARTICULOS_PROHIBIDOS, NOTA_ARTICULOS_PROHIBIDOS } from '@/src/utils/articulos';
import { CIUDADES_POPULARES, Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import {
  PESO_MAX_KG,
  cedulaParaGuardar,
  formatCedula,
  formatTelefono,
  sanitizeText,
  telefonoParaGuardar,
  validateCedula,
  validateMinLength,
  validateMonto,
  validatePeso,
  validatePhone,
} from '@/src/utils/validation';
import type {
  CotizacionEnvioPublica,
  ModalidadPago,
  OpcionCotizacionEnvio,
  SucursalPunto,
} from '@/src/types';
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

interface RutaDisponible {
  id: string;
  precio_pasaje?: number;
  cooperativas?: { id: string; nombre: string; calificacion_promedio?: number };
}

const STEP_TITLES = ['¿A dónde la envías?', 'Detalles de la encomienda', 'Revisa y genera tu código'];

/** Opciones de "Quién paga" (M-43): lo que dice la tarjeta es lo que pasa. */
const OPCIONES_PAGO: { value: ModalidadPago; titulo: string; detalle: string }[] = [
  {
    value: 'ORIGEN',
    titulo: 'Yo, al entregarla',
    detalle: 'En la taquilla, en efectivo o desde la app.',
  },
  {
    value: 'DESTINO',
    titulo: 'Quien recibe, al retirarla',
    detalle: 'En la oficina de destino o desde su app.',
  },
];

/**
 * Lee un número escrito como en Venezuela: "2,5" → 2.5, "1.250,50" → 1250.5
 * (el teclado decimal del teléfono escribe coma). NaN si no es un número.
 */
function leerDecimal(texto: string): number {
  let t = texto.replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Texto con punto decimal para los validadores (que usan `parseFloat`); vacío si no hay dato. */
const textoDecimal = (texto: string) => (texto.trim() ? String(leerDecimal(texto)) : '');

/** "2,5 kg" para mostrar lo que escribió el usuario. */
const textoPeso = (texto: string) => `${texto.trim().replace('.', ',')} kg`;

/** Cotización pública (`fn_cotizar_envio_publico`, USD de referencia y Bs a la tasa BCV). Lanza si falla. */
async function cotizar(peso: number, origen: string, destino: string): Promise<CotizacionEnvioPublica> {
  const { data, error } = await supabase.rpc('fn_cotizar_envio_publico', {
    p_peso_kg: peso,
    p_ciudad_origen: origen,
    p_ciudad_destino: destino,
  });
  if (error) throw error;
  return data as CotizacionEnvioPublica;
}

export default function NuevaEncomiendaWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const { completo: perfilCompleto, loading: cargandoPerfil } = usePerfil();

  const params = useLocalSearchParams<{
    origen_ciudad?: string;
    origen_estado?: string;
    destino_ciudad?: string;
    destino_estado?: string;
  }>();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  /** Se entró a un paso desde "Editar" del resumen (AN-20): el botón vuelve a él. */
  const [editando, setEditando] = useState(false);

  const [origen, setOrigen] = useState<Localidad | null>(
    params.origen_ciudad && params.origen_estado
      ? { ciudad: params.origen_ciudad, estado: params.origen_estado }
      : null
  );
  const [destino, setDestino] = useState<Localidad | null>(
    params.destino_ciudad && params.destino_estado
      ? { ciudad: params.destino_ciudad, estado: params.destino_estado }
      : null
  );

  const [rutas, setRutas] = useState<RutaDisponible[]>([]);
  const [loadingRutas, setLoadingRutas] = useState(false);
  const [errorRutas, setErrorRutas] = useState<string | null>(null);
  const [reintentoRutas, setReintentoRutas] = useState(0);
  const [ruta, setRuta] = useState<RutaDisponible | null>(null);

  /** "Desde Bs X (1 kg)" por cooperativa (`fn_cotizar_envio_publico` con 1 kg). */
  const [desde, setDesde] = useState<Record<string, OpcionCotizacionEnvio>>({});
  const [tasaDesde, setTasaDesde] = useState<{ tasa: number | null; fecha: string | null }>({
    tasa: null,
    fecha: null,
  });

  /** Dónde se entrega el paquete en el origen (M-44). */
  const [sucursales, setSucursales] = useState<SucursalPunto[] | null>(null);
  const [loadingSucursales, setLoadingSucursales] = useState(false);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [reintentoSucursales, setReintentoSucursales] = useState(0);

  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const cedulaRef = useRef<TextInput>(null);
  const telefonoRef = useRef<TextInput>(null);
  const [descripcion, setDescripcion] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [foto, setFoto] = useState<string | null>(null);
  /** Sin valor por defecto (M-43): la persona elige. */
  const [modalidadPago, setModalidadPago] = useState<ModalidadPago | null>(null);
  const [verProhibidos, setVerProhibidos] = useState(false);

  /** Costo estimado del peso escrito para la cooperativa elegida (M-45). */
  const [estimado, setEstimado] = useState<{
    opcion: OpcionCotizacionEnvio | null;
    tasa: number | null;
    fecha: string | null;
  } | null>(null);
  const [loadingCosto, setLoadingCosto] = useState(false);
  const [errorCosto, setErrorCosto] = useState(false);
  /** El peso pasa del máximo (local o de la tarifa vigente, `EB_PESO_INVALIDO`): no es un fallo de red. */
  const [avisoPeso, setAvisoPeso] = useState<string | null>(null);
  const [reintentoCosto, setReintentoCosto] = useState(0);

  const [pedirDatos, setPedirDatos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  /**
   * Una clave por envío que se está creando (índice único `sender_id +
   * idempotency_key`): si el insert llegó a la base pero la respuesta se perdió
   * (red), el reintento no crea un segundo envío, abre el que ya existe.
   */
  const idemKeyRef = useRef(nuevaClaveIdempotencia());
  /** Foto ya subida en un intento anterior (no se sube dos veces). */
  const fotoSubidaRef = useRef<{ uri: string; ruta: string } | null>(null);

  // Atrás (header, botón de Android o gesto) retrocede un paso; en el paso 1
  // pide confirmación si ya hay datos del envío. Mientras se guarda, no se sale.
  const { handleBack, allowLeave } = useWizardBack({
    step,
    setStep,
    isDirty:
      ruta !== null ||
      foto !== null ||
      modalidadPago !== null ||
      [nombre, cedula, telefono, descripcion, pesoKg, valorDeclarado].some((v) => v.trim() !== ''),
    bloqueado: isSubmitting,
  });

  const cooperativaId = ruta?.cooperativas?.id ?? null;
  const nombreCoop = ruta?.cooperativas?.nombre ?? 'la cooperativa';

  // ── Rutas activas para el trayecto ───────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setRutas([]);
      setRuta(null);
      return;
    }

    let isMounted = true;
    const fetchRutas = async () => {
      try {
        setLoadingRutas(true);
        setErrorRutas(null);
        const { data, error } = await supabase
          .from('rutas')
          .select('id, precio_pasaje, cooperativa_id, cooperativas!inner ( id, nombre, calificacion_promedio )')
          .eq('ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('ciudad_destino', normalizeCityForDb(destino.ciudad))
          .eq('activa', true)
          // Una cooperativa suspendida o pendiente no recibe envíos.
          .eq('cooperativas.estado', 'ACTIVA')
          .limit(50);

        if (error) throw error;
        if (isMounted) {
          setRutas((data ?? []) as unknown as RutaDisponible[]);
          setRuta(null);
        }
      } catch (err) {
        if (__DEV__) console.warn('[nueva] Error cargando rutas:', err);
        // M-45: sin red no es lo mismo que "ninguna cooperativa cubre la ruta".
        if (isMounted) {
          setRutas([]);
          setErrorRutas(humanizeError(err, 'carga'));
        }
      } finally {
        if (isMounted) setLoadingRutas(false);
      }
    };

    fetchRutas();
    return () => {
      isMounted = false;
    };
  }, [origen, destino, reintentoRutas]);

  // ── "Desde Bs X (1 kg)" por cooperativa ──────────────────────────────────
  useEffect(() => {
    setDesde({});
    if (!origen || !destino) return;
    let vigente = true;
    cotizar(1, origen.ciudad, destino.ciudad)
      .then((c) => {
        if (!vigente) return;
        const mapa: Record<string, OpcionCotizacionEnvio> = {};
        for (const o of c.opciones ?? []) mapa[o.cooperativa_id] = o;
        setDesde(mapa);
        setTasaDesde({ tasa: c.tasa_bcv, fecha: c.tasa_bcv_fecha });
      })
      .catch(() => {
        // Es solo una referencia: sin ella la tarjeta dice que lo calcula la taquilla.
        if (vigente) setDesde({});
      });
    return () => {
      vigente = false;
    };
  }, [origen, destino, reintentoRutas]);

  // ── Sucursal de entrega de la cooperativa elegida ────────────────────────
  useEffect(() => {
    setSucursales(null);
    setErrorSucursales(null);
    if (!cooperativaId || !origen) return;

    let vigente = true;
    setLoadingSucursales(true);
    (async () => {
      try {
        const lista = await cargarSucursalesCiudad(cooperativaId, origen.ciudad);
        if (vigente) setSucursales(lista);
      } catch (err) {
        if (__DEV__) console.warn('[nueva] Sucursales no disponibles:', err);
        if (vigente) setErrorSucursales(humanizeError(err, 'carga'));
      } finally {
        if (vigente) setLoadingSucursales(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [cooperativaId, origen, reintentoSucursales]);

  // ── Costo estimado (debounced) ───────────────────────────────────────────
  useEffect(() => {
    const peso = leerDecimal(pesoKg);
    setErrorCosto(false);
    setAvisoPeso(
      peso > PESO_MAX_KG
        ? `El peso máximo es ${PESO_MAX_KG} kg. Para paquetes más pesados, habla con la cooperativa.`
        : null
    );
    if (Number.isNaN(peso) || peso <= 0 || peso > PESO_MAX_KG || !origen || !destino || !cooperativaId) {
      setEstimado(null);
      setLoadingCosto(false);
      return;
    }

    // Una respuesta que llega después de cambiar el peso o el trayecto no pisa la nueva.
    let vigente = true;
    setLoadingCosto(true);
    const timer = setTimeout(async () => {
      try {
        const c = await cotizar(peso, origen.ciudad, destino.ciudad);
        if (!vigente) return;
        setEstimado({
          opcion: (c.opciones ?? []).find((o) => o.cooperativa_id === cooperativaId) ?? null,
          tasa: c.tasa_bcv,
          fecha: c.tasa_bcv_fecha,
        });
      } catch (err) {
        if (__DEV__) console.warn('[nueva] Cotización no disponible:', err);
        if (vigente) {
          setEstimado(null);
          // La tarifa vigente puede tener un máximo menor: se dice tal cual, sin "Reintentar".
          if (codigoEB(err) === 'EB_PESO_INVALIDO') setAvisoPeso(humanizeError(err, 'encomienda'));
          else setErrorCosto(true);
        }
      } finally {
        if (vigente) setLoadingCosto(false);
      }
    }, 500);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [pesoKg, origen, destino, cooperativaId, reintentoCosto]);

  // ── Fotos ────────────────────────────────────────────────────────────────
  const pickPhoto = async (source: 'camera' | 'library') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      toast.show(
        'error',
        source === 'camera'
          ? 'Para tomar la foto, permite el acceso a la cámara en los ajustes del teléfono.'
          : 'Para elegir una foto, permite el acceso a tus fotos en los ajustes del teléfono.'
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.length) {
      setFoto(result.assets[0].uri);
    }
  };

  // ── Validación ───────────────────────────────────────────────────────────
  const validateStep2 = useCallback((): boolean => {
    // M-41: cada error nombra su campo.
    const checks: [string, { valid: boolean; message?: string }][] = [
      ['nombre', validateMinLength(nombre, 2, 'El nombre de quien recibe')],
      ['cedula', validateCedula(cedula)],
      ['telefono', validatePhone(telefono)],
      ['descripcion', validateMinLength(descripcion, 3, 'La descripción del contenido')],
      ['peso', validatePeso(textoDecimal(pesoKg))],
      ['valor', validateMonto(textoDecimal(valorDeclarado))],
    ];

    const next: Record<string, string> = {};
    checks.forEach(([key, result]) => {
      if (!result.valid) next[key] = result.message ?? 'Revisa este campo.';
    });
    if (!modalidadPago) next.modalidad = 'Elige quién paga el envío.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [nombre, cedula, telefono, descripcion, pesoKg, valorDeclarado, modalidadPago]);

  const step1Valid = !!origen && !!destino && !!ruta;

  /** Guarda el envío. Solo se llama con el perfil completo. */
  const registrar = useCallback(async () => {
    if (submittingRef.current || !user || !ruta || !modalidadPago) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // La foto va a la carpeta del usuario en el bucket privado; se guarda la ruta.
      let fotoRuta: string | null = null;
      if (foto && fotoSubidaRef.current?.uri === foto) {
        fotoRuta = fotoSubidaRef.current.ruta;
      } else if (foto) {
        try {
          fotoRuta = await uploadEvidencePhoto(foto, user.id);
          fotoSubidaRef.current = { uri: foto, ruta: fotoRuta };
        } catch (err) {
          if (__DEV__) console.warn('[nueva] No se pudo subir la foto:', err);
          toast.show(
            'info',
            `No pudimos subir la foto; registramos el envío sin ella. ${humanizeError(err, 'carga')}`
          );
        }
      }

      const payload: Record<string, unknown> = {
        sender_id: user.id,
        receiver_nombre: sanitizeText(nombre),
        // Formato único ("V-12345678", "0414-1234567"): así la base vincula al destinatario.
        receiver_cedula_rif: cedulaParaGuardar(cedula) ?? sanitizeText(cedula),
        receiver_telefono: telefonoParaGuardar(telefono) ?? sanitizeText(telefono),
        estado_origen: origen?.estado,
        ciudad_origen: origen?.ciudad,
        estado_destino: destino?.estado,
        ciudad_destino: destino?.ciudad,
        descripcion_contenido: sanitizeText(descripcion),
        peso_kg: pesoKg.trim() ? leerDecimal(pesoKg) : null,
        estado: 'PENDIENTE_DE_ESCANEO',
        modalidad_pago: modalidadPago,
        cooperativa_id: ruta.cooperativas?.id,
        idempotency_key: idemKeyRef.current,
      };
      // Solo con foto: así un envío sin foto no depende de la columna nueva.
      if (fotoRuta) payload.foto_cliente_path = fotoRuta;
      if (valorDeclarado.trim()) payload.valor_declarado = leerDecimal(valorDeclarado);

      const { data: creada, error } = await supabase
        .from('encomiendas')
        .insert(payload)
        .select('id')
        .single();

      let data = creada;
      if (error) {
        // Ya existe un envío con esta clave: el intento anterior sí se guardó.
        const repetido =
          error.code === '23505' &&
          `${error.message ?? ''} ${error.details ?? ''}`.includes('idempotencia');
        if (!repetido) throw error;
        const { data: previa, error: errPrevia } = await supabase
          .from('encomiendas')
          .select('id')
          .eq('sender_id', user.id)
          .eq('idempotency_key', idemKeyRef.current)
          .maybeSingle();
        if (errPrevia || !previa) throw errPrevia ?? error;
        data = previa;
      }
      if (!data) throw new Error('Encomienda sin id');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      // AN-05: el detalle queda encima de "Enviadas", así ← cae en la lista donde
      // vive. Muestra "¡Encomienda registrada!" con la sucursal donde llevarla.
      router.dismissTo('/(tabs)/encomiendas?vista=enviadas');
      router.push({ pathname: '/encomiendas/enviar/[id]', params: { id: data.id, recien: '1' } });
    } catch (err) {
      if (__DEV__) console.warn('[nueva] Error creando encomienda:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No pudimos registrar tu envío. ${humanizeError(err, 'encomienda')}`);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [
    user,
    ruta,
    foto,
    nombre,
    cedula,
    telefono,
    origen,
    destino,
    descripcion,
    pesoKg,
    valorDeclarado,
    modalidadPago,
    toast,
    router,
    allowLeave,
  ]);

  const handleContinue = useCallback(async () => {
    // AN-20: desde "Editar", el botón dice "Volver al resumen" y salta al paso 3
    // (revisando también el paso 2, por si se cambió algo ahí).
    if (editando && step < 3) {
      if (step === 1 && !step1Valid) return;
      if (!validateStep2()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setStep(2);
        return;
      }
      Haptics.selectionAsync();
      setEditando(false);
      setStep(3);
      return;
    }

    if (step === 1) {
      if (!step1Valid) return;
      Haptics.selectionAsync();
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!validateStep2()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.selectionAsync();
      setStep(3);
      return;
    }

    // Paso 3: sin cédula ni teléfono en el perfil, primero se piden (#24).
    // Mientras el perfil carga no se sabe si está completo: no se registra a ciegas.
    if (cargandoPerfil) {
      toast.show('info', 'Estamos cargando tus datos. Intenta de nuevo en un momento.');
      return;
    }
    if (!perfilCompleto) {
      setPedirDatos(true);
      return;
    }
    registrar();
  }, [editando, step, step1Valid, validateStep2, cargandoPerfil, perfilCompleto, registrar, toast]);

  /** "Editar" del resumen: abre el paso y el botón vuelve aquí (AN-20). */
  const editar = useCallback((paso: 1 | 2) => {
    setEditando(true);
    setStep(paso);
  }, []);

  /** Por qué no se puede continuar (el botón lo dice, no se queda mudo). */
  const motivoBloqueo =
    step === 1 && !step1Valid
      ? !origen || !destino
        ? 'Elige origen y destino'
        : 'Elige la cooperativa'
      : step === 2 && !modalidadPago
        ? 'Elige quién paga'
        : step === 2 && Object.keys(errors).length > 0
          ? 'Revisa los campos marcados en rojo'
          : null;
  const canContinue = !(step === 1 && !step1Valid) && !(step === 2 && !modalidadPago);

  const costoEstimadoTexto =
    estimado?.opcion
      ? formatMoney({
          usd: estimado.opcion.costo_usd,
          bs: estimado.opcion.costo_bs,
          tasa: tasaRefDe(estimado.tasa, estimado.fecha),
        }).principal
      : null;

  const trayecto = origen && destino ? `${origen.ciudad} → ${destino.ciudad}` : null;

  /** Una línea sobre el botón (§2.1 regla 6): lo que falta o lo elegido. */
  const resumenPaso =
    motivoBloqueo ??
    (step === 1
      ? ruta && trayecto
        ? `${trayecto} · ${nombreCoop}`
        : null
      : modalidadPago
        ? [
            MODALIDAD_PAGO[modalidadPago].corto,
            costoEstimadoTexto ? `Estimado ${costoEstimadoTexto}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : null);

  const textoBoton = step === 3 ? 'Generar código QR' : editando ? 'Volver al resumen' : 'Continuar';

  return (
    <Screen atmosfera="calida">
      <ScreenHeader
        variant="steps"
        title={STEP_TITLES[step - 1]}
        step={step}
        totalSteps={3}
        onBack={handleBack}
        backLabel={step > 1 ? 'Paso anterior' : 'Salir'}
      />

      <EvitarTeclado>
        <ScrollView
          contentContainerStyle={scrollContent({ floatingAction: true, top: Spacing.lg })}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {/* ─── Paso 1: ruta, cooperativa y dónde entregarla ─────────────── */}
          {step === 1 && (
            <>
              <Card>
                <RouteField
                  origen={origen}
                  destino={destino}
                  onOrigen={setOrigen}
                  onDestino={setDestino}
                  onIntercambiar={() => {
                    setOrigen(destino);
                    setDestino(origen);
                  }}
                  populares={CIUDADES_POPULARES}
                />
              </Card>

              {origen && destino ? (
                <View style={s.section}>
                  {loadingRutas ? (
                    <>
                      <SectionLabel>Cooperativa</SectionLabel>
                      <CardSkeleton count={2} />
                    </>
                  ) : errorRutas ? (
                    <ErrorState
                      title="No pudimos cargar las cooperativas"
                      description={errorRutas}
                      onRetry={() => setReintentoRutas((n) => n + 1)}
                      compact
                    />
                  ) : rutas.length === 0 ? (
                    <EmptyState
                      icon={Package}
                      title="Sin cooperativas en esta ruta"
                      description="Prueba con otro destino."
                      compact
                    />
                  ) : (
                    <>
                      <SectionLabel>Cooperativa</SectionLabel>
                      <View accessibilityRole="radiogroup">
                        {rutas.map((option, index) => {
                          const nombreOpcion = option.cooperativas?.nombre ?? 'Cooperativa';
                          const rating = option.cooperativas?.calificacion_promedio ?? 0;
                          const ref = option.cooperativas?.id
                            ? desde[option.cooperativas.id]
                            : undefined;
                          // M-38: `precio_pasaje` es el boleto de una persona, no el envío.
                          const precio = ref
                            ? `Desde ${
                                formatMoney({
                                  usd: ref.costo_usd,
                                  bs: ref.costo_bs,
                                  tasa: tasaRefDe(tasaDesde.tasa, tasaDesde.fecha),
                                }).principal
                              } (1 kg)`
                            : 'El costo depende del peso';

                          return (
                            <StaggerItem key={option.id} index={index}>
                              <EntityCard
                                selectable
                                selected={ruta?.id === option.id}
                                onPress={() => setRuta(option)}
                                leading={<IconTile tone="coral" icon={Bus} />}
                                title={nombreOpcion}
                                subtitle={precio}
                                adorno={rating > 0 ? <Calificacion valor={rating} /> : undefined}
                              />
                            </StaggerItem>
                          );
                        })}
                      </View>

                      {/* M-44: dónde llevarla */}
                      {ruta ? (
                        <View style={s.sectionTight}>
                          <SectionLabel>Dónde entregarla</SectionLabel>
                          {errorSucursales ? (
                            <ErrorState
                              title="No pudimos ver las taquillas"
                              description={errorSucursales}
                              onRetry={() => setReintentoSucursales((n) => n + 1)}
                              compact
                            />
                          ) : (
                            <Card padding="sm">
                              {loadingSucursales || !sucursales ? (
                                <View style={s.sucursal} accessibilityLabel="Cargando">
                                  <SkeletonLoader width="70%" height={Sizes.icon.md} />
                                  <SkeletonLoader width="45%" height={Sizes.icon.xs} />
                                </View>
                              ) : sucursales.length === 0 ? (
                                <Text variant="secondary" color="muted">
                                  {`Pregunta en la taquilla de ${nombreCoop} en ${origen.ciudad}.`}
                                </Text>
                              ) : (
                                sucursales.map((suc, i) => (
                                  <View key={suc.id}>
                                    {i > 0 ? <Divider spacing={Spacing.md} /> : null}
                                    <View style={s.sucursal}>
                                      <Text variant="subheading">{suc.nombre}</Text>
                                      {suc.direccion ? (
                                        <Text variant="secondary" color="muted">
                                          {suc.direccion}
                                        </Text>
                                      ) : null}
                                      {suc.horario || suc.telefono ? (
                                        <Text variant="caption" color="muted">
                                          {[suc.horario, suc.telefono ? `Tel. ${suc.telefono}` : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                ))
                              )}
                            </Card>
                          )}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </>
          )}

          {/* ─── Paso 2: destinatario, contenido y quién paga ─────────────── */}
          {step === 2 && (
            <>
              <SectionLabel>Datos de quien recibe</SectionLabel>
              {/* El último campo ya deja su margen: el pie de la tarjeta no lo duplica. */}
              <Card padding="none">
                <View style={s.cardCampos}>
                  <Field
                    label="Nombre y apellido"
                    placeholder="Ej. María Pérez"
                    value={nombre}
                    onChangeText={(v) => setNombre(v.slice(0, 80))}
                    error={errors.nombre}
                    autoCapitalize="words"
                    autoComplete="off"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => cedulaRef.current?.focus()}
                  />
                  <CedulaField
                    ref={cedulaRef}
                    value={cedula}
                    onChangeText={setCedula}
                    error={errors.cedula}
                    letras={['V', 'E', 'J', 'P']}
                    returnKeyType="next"
                    onSubmitEditing={() => telefonoRef.current?.focus()}
                  />
                  <TelefonoField
                    ref={telefonoRef}
                    value={telefono}
                    onChangeText={setTelefono}
                    error={errors.telefono}
                    returnKeyType="done"
                  />
                </View>
              </Card>

              <View style={s.section}>
                <SectionLabel>Contenido</SectionLabel>
                <Card>
                  <Field
                    label="Descripción"
                    placeholder="Ej. ropa y documentos"
                    value={descripcion}
                    onChangeText={(v) => setDescripcion(v.slice(0, 300))}
                    error={errors.descripcion}
                    multiline
                    numberOfLines={3}
                    containerStyle={s.campoConEnlace}
                  />
                  <View style={s.enlace}>
                    <TextLink onPress={() => setVerProhibidos(true)}>Qué no se puede enviar</TextLink>
                  </View>

                  <Field
                    label="Peso aproximado (kg) · opcional"
                    placeholder="Ej. 2,5"
                    keyboardType="decimal-pad"
                    value={pesoKg}
                    onChangeText={setPesoKg}
                    error={errors.peso}
                  />

                  {/* M-45: el estimado nunca desaparece en silencio. */}
                  {pesoKg.trim() && !errors.peso && cooperativaId ? (
                    <View style={s.costRow} accessibilityLiveRegion="polite">
                      {avisoPeso ? (
                        <Text variant="caption" color="dangerText" style={s.flex}>
                          {avisoPeso}
                        </Text>
                      ) : loadingCosto ? (
                        <Text variant="caption" color="muted">
                          Calculando el costo estimado…
                        </Text>
                      ) : errorCosto ? (
                        <View style={[s.flex, s.costError]}>
                          <Text variant="caption" color="muted" style={s.flex}>
                            No pudimos calcular el estimado.
                          </Text>
                          <TextLink
                            onPress={() => setReintentoCosto((n) => n + 1)}
                            accessibilityLabel="Reintentar el costo estimado"
                          >
                            Reintentar
                          </TextLink>
                        </View>
                      ) : estimado?.opcion ? (
                        // Apilado: en una fila, el monto y su referencia no caben junto a la etiqueta.
                        <View style={[s.flex, s.costEstimado]}>
                          <Text variant="caption" color="muted">
                            Costo estimado
                          </Text>
                          <Monto
                            usd={estimado.opcion.costo_usd}
                            bs={estimado.opcion.costo_bs}
                            tasa={tasaRefDe(estimado.tasa, estimado.fecha)}
                          />
                        </View>
                      ) : estimado ? (
                        <Text variant="caption" color="muted">
                          {`Sin estimado para ${nombreCoop}.`}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <Field
                    label="Valor del contenido (USD) · opcional"
                    placeholder="Ej. 50"
                    keyboardType="decimal-pad"
                    value={valorDeclarado}
                    onChangeText={setValorDeclarado}
                    error={errors.valor}
                  />

                  {/* La única mención del límite. */}
                  <Aviso tono="warning" icon={Warning} texto={`Máximo ${PESO_MAX_KG} kg y 50 × 50 × 50 cm.`} />
                </Card>
              </View>

              {/* M-43: quién paga, sin opción marcada de antemano */}
              <View style={s.section}>
                <SectionLabel>Quién paga</SectionLabel>
                <View accessibilityRole="radiogroup">
                  {OPCIONES_PAGO.map((op) => (
                    <OpcionRadio
                      key={op.value}
                      titulo={op.titulo}
                      detalle={op.detalle}
                      selected={modalidadPago === op.value}
                      onPress={() => {
                        setModalidadPago(op.value);
                        setErrors((e) => {
                          const resto = { ...e };
                          delete resto.modalidad;
                          return resto;
                        });
                      }}
                    />
                  ))}
                </View>
                {errors.modalidad ? (
                  <Text variant="caption" color="dangerText" accessibilityRole="alert" style={s.radioError}>
                    {errors.modalidad}
                  </Text>
                ) : null}
              </View>

              <View style={s.section}>
                <SectionLabel>Foto · opcional</SectionLabel>
                {foto ? (
                  <Card padding="sm">
                    <Image
                      source={{ uri: foto }}
                      style={s.photo}
                      resizeMode="cover"
                      accessibilityLabel="Foto de la encomienda"
                    />
                    <View style={s.photoActions}>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => pickPhoto('library')}
                        style={s.photoButton}
                      >
                        Cambiar foto
                      </Button>
                      <Button
                        variant="dangerGhost"
                        size="sm"
                        onPress={() => setFoto(null)}
                        style={s.photoButton}
                      >
                        Quitar foto
                      </Button>
                    </View>
                  </Card>
                ) : (
                  <View style={s.photoActions}>
                    <PhotoOption icon={Camera} label="Tomar foto" onPress={() => pickPhoto('camera')} />
                    <PhotoOption
                      icon={ImageIcon}
                      label="Galería"
                      onPress={() => pickPhoto('library')}
                    />
                  </View>
                )}
              </View>
            </>
          )}

          {/* ─── Paso 3: revisar antes de guardar (M-42, AN-15, AU-24) ─────── */}
          {step === 3 && (
            <>
              <Card>
                <BloqueResumen titulo="Trayecto" onEditar={() => editar(1)}>
                  <Text variant="bodyStrong">{trayecto ?? '—'}</Text>
                  <Text variant="caption" color="muted">
                    {[
                      nombreCoop,
                      sucursales && sucursales.length === 1
                        ? `Llévala a ${sucursales[0].nombre}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </BloqueResumen>

                <Divider />

                <BloqueResumen titulo="Quien recibe" onEditar={() => editar(2)}>
                  <Text variant="bodyStrong">{sanitizeText(nombre)}</Text>
                  <Text variant="caption" color="muted">
                    {`C.I. ${formatCedula(cedula)} · Tel. ${formatTelefono(telefono)}`}
                  </Text>
                  {/* M-50: la base vincula el envío a la cuenta del destinatario. */}
                  <Text variant="caption" color="muted">
                    Si tiene EnBus, la verá en su app.
                  </Text>
                </BloqueResumen>

                <Divider />

                <BloqueResumen titulo="Contenido" onEditar={() => editar(2)}>
                  <Text variant="bodyStrong">{sanitizeText(descripcion)}</Text>
                  <Text variant="caption" color="muted">
                    {[
                      pesoKg.trim() ? textoPeso(pesoKg) : 'Peso sin indicar',
                      valorDeclarado.trim() && Number.isFinite(leerDecimal(valorDeclarado))
                        ? `Valor ${formatUsd(leerDecimal(valorDeclarado))}`
                        : null,
                      costoEstimadoTexto ? `Costo estimado ${costoEstimadoTexto}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {foto ? (
                    <Image
                      source={{ uri: foto }}
                      style={s.photoSummary}
                      resizeMode="cover"
                      accessibilityLabel="Foto de la encomienda"
                    />
                  ) : null}
                </BloqueResumen>

                <Divider />

                <BloqueResumen titulo="Quién paga" onEditar={() => editar(2)}>
                  <Text variant="bodyStrong">
                    {modalidadPago ? MODALIDAD_PAGO[modalidadPago].corto : '—'}
                  </Text>
                  <Text variant="caption" color="muted">
                    {modalidadPago ? MODALIDAD_PAGO[modalidadPago].largo : ''}
                  </Text>
                </BloqueResumen>
              </Card>

              <Aviso tono="info" icon={Info} texto="La taquilla calcula el costo al pesar el paquete." style={s.note} />
            </>
          )}
        </ScrollView>
      </EvitarTeclado>

      <FloatingBar resumen={resumenPaso}>
        <Button
          fullWidth
          disabled={!canContinue}
          loading={isSubmitting}
          onPress={handleContinue}
          accessibilityLabel={motivoBloqueo ? `${textoBoton}. ${motivoBloqueo}` : undefined}
        >
          {textoBoton}
        </Button>
      </FloatingBar>

      {/* ── Qué no se puede enviar (M-44) ─────────────────────────────────── */}
      <BottomSheet
        visible={verProhibidos}
        onClose={() => setVerProhibidos(false)}
        title="Qué no se puede enviar"
        footer={
          <Button variant="secondary" fullWidth onPress={() => setVerProhibidos(false)}>
            Entendido
          </Button>
        }
      >
        {ARTICULOS_PROHIBIDOS.map((a) => (
          <View key={a.nombre} style={s.prohibido}>
            <IconTile size="sm" estado="danger" icon={Prohibit} />
            <View style={s.flex}>
              <Text variant="bodyStrong">{a.nombre}</Text>
              <Text variant="caption" color="muted">
                {a.detalle}
              </Text>
            </View>
          </View>
        ))}
        <Text variant="caption" color="muted" style={s.prohibidoNota}>
          {NOTA_ARTICULOS_PROHIBIDOS}
        </Text>
      </BottomSheet>

      {/* ── Cédula y teléfono del remitente antes del primer envío (#24) ──── */}
      <CompletarPerfilSheet
        visible={pedirDatos}
        motivo="envio"
        onClose={() => setPedirDatos(false)}
        onCompletado={() => {
          setPedirDatos(false);
          registrar();
        }}
      />
    </Screen>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Valoración neutra de la cooperativa: estrella de marca + número. */
function Calificacion({ valor }: { valor: number }) {
  return (
    <View style={s.calificacion} accessibilityLabel={`Calificación ${formatNumeroVE(valor, 1)}`}>
      <Star size={Sizes.icon.sm} color={Colors.primaryDeep} weight="fill" />
      <Text variant="caption" weight="semibold" compact>
        {formatNumeroVE(valor, 1)}
      </Text>
    </View>
  );
}

function PhotoOption({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<IconProps>;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.photoOption}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <IconTile tone="coral" icon={Icon} />
      <Text variant="label" weight="semibold">
        {label}
      </Text>
    </PressableScale>
  );
}

/** Tarjeta radio: título, una línea y círculo marcado (selección `accentStrong`, D1). */
function OpcionRadio({
  titulo,
  detalle,
  selected,
  onPress,
}: {
  titulo: string;
  detalle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={[s.radio, selected && s.radioSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${titulo}. ${detalle}`}
    >
      <View style={[s.radioCircle, selected && s.radioCircleSelected]}>
        {selected ? <View style={s.radioDot} /> : null}
      </View>
      <View style={s.flex}>
        <Text variant="bodyStrong">{titulo}</Text>
        <Text variant="caption" color="muted">
          {detalle}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Bloque del resumen con su enlace "Editar". */
function BloqueResumen({
  titulo,
  onEditar,
  children,
}: {
  titulo: string;
  onEditar: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={s.bloque}>
      <View style={s.bloqueHead}>
        <Text variant="caption" color="muted" style={s.flex}>
          {titulo}
        </Text>
        <TextLink onPress={onEditar} accessibilityLabel={`Editar ${titulo.toLowerCase()}`}>
          Editar
        </TextLink>
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  section: {
    marginTop: Layout.sectionGap,
  },
  /** Tras una lista de tarjetas (que ya dejan `md` debajo). */
  sectionTight: {
    marginTop: Spacing.xl,
  },
  sucursal: {
    gap: Spacing.xs / 2,
  },
  calificacion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardCampos: {
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
  },
  campoConEnlace: {
    marginBottom: 0,
  },
  enlace: {
    marginBottom: Spacing.xs,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  costEstimado: {
    gap: Spacing.xs / 2,
  },
  costError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: Colors.card,
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.card,
    ...Shadows.card,
  },
  radioSelected: {
    borderColor: Colors.accentStrong,
  },
  radioCircle: {
    width: Sizes.icon.lg,
    height: Sizes.icon.lg,
    borderRadius: Radius.full,
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.borderControl,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: Colors.accentStrong,
  },
  radioDot: {
    width: Sizes.icon.lg / 2,
    height: Sizes.icon.lg / 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentStrong,
  },
  radioError: {
    marginTop: Spacing.xs,
  },
  note: {
    marginTop: Spacing.lg,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  photoSummary: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  photoActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  photoButton: {
    flex: 1,
  },
  photoOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    ...Shadows.card,
  },
  bloque: {
    gap: Spacing.xs / 2,
  },
  // El enlace conserva sus 44 pt de toque sin separar la etiqueta de su valor.
  bloqueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: -Spacing.md,
  },
  prohibido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    paddingHorizontal: Layout.screenPadding,
  },
  prohibidoNota: {
    marginBottom: Spacing.md,
    paddingHorizontal: Layout.screenPadding,
  },
});
