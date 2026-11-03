import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Camera,
  ClipboardText,
  Image as ImageIcon,
  Info,
  MapPin,
  Prohibit,
  Star,
  Storefront,
  Warning,
  type IconProps,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LocationSelector } from '@/src/components/LocationSelector';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import { CedulaField } from '@/src/components/CedulaField';
import { TelefonoField } from '@/src/components/TelefonoField';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  EntityCard,
  ErrorState,
  Field,
  FloatingBar,
  LoadingState,
  Monto,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { uploadEvidencePhoto } from '@/src/utils/storage';
import { codigoEB, humanizeError } from '@/src/utils/errores';
import { useWizardBack } from '@/src/hooks/useWizardBack';
import { usePerfil } from '@/src/hooks/usePerfil';
import { cargarSucursalesCiudad } from '@/src/hooks/useEncomiendas';
import { formatMoney, formatUsd, tasaRefDe } from '@/src/utils/dinero';
import { MODALIDAD_PAGO } from '@/src/utils/estados';
import { ARTICULOS_PROHIBIDOS, NOTA_ARTICULOS_PROHIBIDOS } from '@/src/utils/articulos';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
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
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

interface RutaDisponible {
  id: string;
  precio_pasaje?: number;
  cooperativas?: { id: string; nombre: string; calificacion_promedio?: number };
}

const STEP_TITLES = ['¿A dónde lo envías?', 'Detalles del envío', 'Revisa y genera tu código'];

/** Opciones de "¿Quién paga el envío?" (M-43): lo que dice la tarjeta es lo que pasa. */
const OPCIONES_PAGO: { value: ModalidadPago; titulo: string; detalle: string }[] = [
  {
    value: 'ORIGEN',
    titulo: 'Yo, al entregarlo en la taquilla',
    detalle: 'Pagas cuando la taquilla pese el paquete: en efectivo ahí mismo o desde la app.',
  },
  {
    value: 'DESTINO',
    titulo: 'Quien recibe, al retirarlo',
    detalle: 'Paga en la oficina de destino, o desde su app si tiene EnBus.',
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
          .select('id, precio_pasaje, cooperativa_id, cooperativas ( id, nombre, calificacion_promedio )')
          .eq('ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('ciudad_destino', normalizeCityForDb(destino.ciudad))
          .eq('activa', true);

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
      if (foto) {
        try {
          fotoRuta = await uploadEvidencePhoto(foto, user.id);
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
      };
      // Solo con foto: así un envío sin foto no depende de la columna nueva.
      if (fotoRuta) payload.foto_cliente_path = fotoRuta;
      if (valorDeclarado.trim()) payload.valor_declarado = leerDecimal(valorDeclarado);

      const { data, error } = await supabase
        .from('encomiendas')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      // El detalle muestra "¡Encomienda registrada!" con la sucursal donde llevarlo.
      router.replace({ pathname: '/encomiendas/enviar/[id]', params: { id: data.id, recien: '1' } });
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
  }, [step, step1Valid, validateStep2, cargandoPerfil, perfilCompleto, registrar, toast]);

  /** Por qué no se puede continuar (el botón lo dice, no se queda mudo). */
  const motivoBloqueo =
    step === 1 && !step1Valid
      ? !origen || !destino
        ? 'Elige origen y destino'
        : 'Elige la cooperativa'
      : step === 2 && !modalidadPago
        ? 'Elige quién paga el envío'
        : step === 2 && Object.keys(errors).length > 0
          ? 'Revisa los campos marcados en rojo'
          : null;
  const canContinue = !(step === 1 && !step1Valid) && !(step === 2 && !modalidadPago);

  const textoSucursales = (() => {
    if (!sucursales) return null;
    if (sucursales.length === 0) {
      return `Pregunta en la taquilla de ${nombreCoop} en ${origen?.ciudad ?? 'tu ciudad'} dónde recibir el paquete.`;
    }
    return null;
  })();

  const costoEstimadoTexto =
    estimado?.opcion
      ? formatMoney({
          usd: estimado.opcion.costo_usd,
          bs: estimado.opcion.costo_bs,
          tasa: tasaRefDe(estimado.tasa, estimado.fecha),
        }).principal
      : null;

  return (
    <Screen>
      <ScreenHeader
        variant="steps"
        title={STEP_TITLES[step - 1]}
        step={step}
        totalSteps={3}
        onBack={handleBack}
        backLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ floatingAction: true, top: Spacing.sm })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Paso 1: ruta, cooperativa y dónde entregarlo ─────────────── */}
        {step === 1 && (
          <>
            <Card tone="sunken" padding="sm" elevated={false} radius="2xl">
              <View style={s.routeBar}>
                <LocationSelector
                  label="Origen"
                  value={origen}
                  onChange={setOrigen}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={origen?.ciudad}
                      placeholder="Origen"
                      tint={Colors.accent}
                      onPress={open}
                    />
                  )}
                />
                <Text variant="caption" color="muted" compact>
                  →
                </Text>
                <LocationSelector
                  label="Destino"
                  value={destino}
                  onChange={setDestino}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={destino?.ciudad}
                      placeholder="Destino"
                      tint={Colors.secondary}
                      onPress={open}
                    />
                  )}
                />
              </View>
            </Card>

            <View style={s.section}>
              {!origen || !destino ? (
                <EmptyState
                  icon={MapPin}
                  title="Elige el trayecto"
                  description="Selecciona origen y destino para ver qué cooperativas llevan encomiendas en esa ruta."
                  compact
                />
              ) : loadingRutas ? (
                <LoadingState label="Buscando cooperativas…" compact />
              ) : errorRutas ? (
                <ErrorState
                  title="No pudimos cargar las cooperativas"
                  description={errorRutas}
                  onRetry={() => setReintentoRutas((n) => n + 1)}
                  compact
                />
              ) : rutas.length === 0 ? (
                <EmptyState
                  icon={Warning}
                  title="Sin rutas activas"
                  description="Ninguna cooperativa cubre este trayecto por ahora. Prueba con otro destino."
                  compact
                />
              ) : (
                <>
                  <SectionLabel>Elige la cooperativa</SectionLabel>
                  {rutas.map((option, index) => {
                    const nombreOpcion = option.cooperativas?.nombre ?? 'Cooperativa';
                    const rating = option.cooperativas?.calificacion_promedio ?? 0;
                    const ref = option.cooperativas?.id ? desde[option.cooperativas.id] : undefined;
                    const desdeTexto = ref
                      ? `Desde ${
                          formatMoney({
                            usd: ref.costo_usd,
                            bs: ref.costo_bs,
                            tasa: tasaRefDe(tasaDesde.tasa, tasaDesde.fecha),
                          }).principal
                        } (1 kg)`
                      : 'El costo depende del peso; lo calcula la taquilla';

                    return (
                      <StaggerItem key={option.id} index={index}>
                        <EntityCard
                          selectable
                          selected={ruta?.id === option.id}
                          onPress={() => setRuta(option)}
                          title={nombreOpcion}
                          // M-38: `precio_pasaje` es el boleto de una persona, no el envío.
                          subtitle={desdeTexto}
                          initial={nombreOpcion.charAt(0).toUpperCase()}
                          tone="brand"
                          badge={
                            rating > 0 ? (
                              <Badge tone="pending" icon={Star}>
                                {rating.toFixed(1)}
                              </Badge>
                            ) : (
                              <Badge tone="neutral">Sin calificación</Badge>
                            )
                          }
                        />
                      </StaggerItem>
                    );
                  })}

                  {/* M-44: dónde llevar el paquete */}
                  {ruta ? (
                    <Card tone="sunken" padding="md" elevated={false} style={s.section}>
                      <View style={s.inlineRow}>
                        <Storefront size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
                        <Text variant="bodyStrong" style={s.flex}>
                          Dónde entregar el paquete
                        </Text>
                      </View>
                      {loadingSucursales ? (
                        <Text variant="secondary" color="muted" style={s.sucursalText}>
                          Buscando la taquilla…
                        </Text>
                      ) : errorSucursales ? (
                        <ErrorState
                          title="No pudimos ver las taquillas"
                          description={`${errorSucursales} Igual puedes continuar: la dirección aparecerá en el detalle del envío.`}
                          onRetry={() => setReintentoSucursales((n) => n + 1)}
                          compact
                        />
                      ) : textoSucursales ? (
                        <Text variant="secondary" color="muted" style={s.sucursalText}>
                          {textoSucursales}
                        </Text>
                      ) : (
                        (sucursales ?? []).map((suc, i) => (
                          <View key={suc.id} style={[s.sucursal, i > 0 && s.sucursalDivided]}>
                            <Text variant="secondary">
                              {`Llévalo a: ${[suc.nombre, suc.direccion].filter(Boolean).join(' · ')}`}
                            </Text>
                            {suc.horario || suc.telefono ? (
                              <Text variant="caption" color="muted">
                                {[suc.horario, suc.telefono ? `Tel. ${suc.telefono}` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Text>
                            ) : null}
                          </View>
                        ))
                      )}
                    </Card>
                  ) : null}
                </>
              )}
            </View>
          </>
        )}

        {/* ─── Paso 2: destinatario, paquete y quién paga ───────────────── */}
        {step === 2 && (
          <>
            <Card tone="sunken" padding="md" elevated={false}>
              <SectionLabel>Datos de quien recibe</SectionLabel>

              <Field
                label="Nombre y apellido"
                placeholder="Juan Pérez"
                value={nombre}
                onChangeText={(v) => setNombre(v.slice(0, 80))}
                error={errors.nombre}
                autoCapitalize="words"
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
                helper="Lo usamos para avisarle y para que vea el envío en su app."
                returnKeyType="done"
              />
            </Card>

            <Card tone="sunken" padding="md" elevated={false} style={s.section}>
              <SectionLabel>Contenido del paquete</SectionLabel>

              <Field
                label="¿Qué contiene?"
                placeholder="Documentos, ropa, electrónica…"
                value={descripcion}
                onChangeText={(v) => setDescripcion(v.slice(0, 300))}
                error={errors.descripcion}
                multiline
                numberOfLines={3}
              />

              <PressableScale
                onPress={() => setVerProhibidos(true)}
                haptic
                hapticType="selection"
                style={s.linkRow}
                accessibilityRole="button"
                accessibilityLabel="Qué no se puede enviar"
              >
                <Prohibit size={Sizes.icon.sm} color={Colors.dangerText} weight="bold" />
                <Text variant="caption" weight="bold" color="dangerText" style={s.link}>
                  Qué no se puede enviar
                </Text>
              </PressableScale>

              <Field
                label="Peso aproximado (kg) · opcional"
                placeholder="5"
                keyboardType="decimal-pad"
                value={pesoKg}
                onChangeText={setPesoKg}
                error={errors.peso}
                helper={`Lo usamos para estimar el costo. Máximo ${PESO_MAX_KG} kg.`}
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
                    <View style={s.flex}>
                      <Text variant="caption" color="muted">
                        No pudimos calcular el costo estimado. La taquilla lo calcula al pesar el
                        paquete.
                      </Text>
                      <PressableScale
                        onPress={() => setReintentoCosto((n) => n + 1)}
                        haptic
                        hapticType="selection"
                        style={s.linkBox}
                        accessibilityRole="button"
                        accessibilityLabel="Reintentar el costo estimado"
                      >
                        <Text variant="caption" weight="bold" color="foreground" style={s.link}>
                          Reintentar
                        </Text>
                      </PressableScale>
                    </View>
                  ) : estimado?.opcion ? (
                    <>
                      <View style={s.costLabel}>
                        <Text variant="overline" color="muted" uppercase>
                          Costo estimado
                        </Text>
                        <Text variant="caption" color="muted">
                          La taquilla confirma el costo al pesar el paquete
                        </Text>
                      </View>
                      <Monto
                        usd={estimado.opcion.costo_usd}
                        bs={estimado.opcion.costo_bs}
                        tasa={tasaRefDe(estimado.tasa, estimado.fecha)}
                        align="right"
                      />
                    </>
                  ) : estimado ? (
                    <Text variant="caption" color="muted">
                      {`Sin estimado para ${nombreCoop}. La taquilla calcula el costo al pesar el paquete.`}
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
                helper="Si se pierde o se daña, el seguro cubre hasta 3 veces este valor."
              />

              <View style={s.alert}>
                <Warning weight="fill" color={Colors.warningText} size={Sizes.icon.md} />
                <Text variant="caption" color="muted" style={s.flex}>
                  {`Peso máximo ${PESO_MAX_KG} kg y medidas máximas 50 × 50 × 50 cm. Los paquetes fuera de estos límites pueden ser rechazados en la taquilla.`}
                </Text>
              </View>
            </Card>

            {/* M-43: quién paga, sin opción marcada de antemano */}
            <View style={s.section} accessibilityRole="radiogroup">
              <SectionLabel>¿Quién paga el envío?</SectionLabel>
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
              {errors.modalidad ? (
                <Text variant="caption" color="dangerText" accessibilityRole="alert">
                  {errors.modalidad}
                </Text>
              ) : null}
            </View>

            <Card tone="sunken" padding="md" elevated={false} style={s.section}>
              <SectionLabel>Foto del paquete · opcional</SectionLabel>
              <Text variant="caption" color="muted" style={s.photoHelp}>
                Ayuda a la taquilla y a quien recibe a reconocer el paquete.
              </Text>

              {foto ? (
                <>
                  <Image
                    source={{ uri: foto }}
                    style={s.photo}
                    resizeMode="cover"
                    accessibilityLabel="Foto del paquete"
                  />
                  <View style={s.photoActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => pickPhoto('library')}
                      style={s.photoButton}
                    >
                      Cambiar foto
                    </Button>
                    <Button
                      variant="dangerSoft"
                      size="sm"
                      onPress={() => setFoto(null)}
                      style={s.photoButton}
                    >
                      Quitar foto
                    </Button>
                  </View>
                </>
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
            </Card>
          </>
        )}

        {/* ─── Paso 3: revisar antes de guardar (M-42) ──────────────────── */}
        {step === 3 && (
          <>
            <View style={s.reviewBlock}>
              <View style={s.reviewIcon}>
                <ClipboardText weight="bold" color={Colors.foreground} size={Sizes.icon.xl} />
              </View>
              <Text variant="heading" size="xl" align="center">
                Revisa antes de generar tu código
              </Text>
              <Text variant="secondary" color="muted" align="center" style={s.reviewText}>
                Aún no hemos registrado tu envío. Si todo está bien, toca «Generar código QR».
              </Text>
            </View>

            <Card padding="md">
              <BloqueResumen titulo="Trayecto" onEditar={() => setStep(1)}>
                <Text variant="bodyStrong">{`${origen?.ciudad ?? '—'} → ${destino?.ciudad ?? '—'}`}</Text>
                <Text variant="caption" color="muted">
                  {[
                    nombreCoop,
                    sucursales && sucursales.length === 1
                      ? `Llévalo a ${sucursales[0].nombre}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </BloqueResumen>

              <Divider />

              <BloqueResumen titulo="Quien recibe" onEditar={() => setStep(2)}>
                <Text variant="bodyStrong">{sanitizeText(nombre)}</Text>
                <Text variant="caption" color="muted">
                  {`C.I. ${formatCedula(cedula)} · Tel. ${formatTelefono(telefono)}`}
                </Text>
                {/* M-50: la base vincula el envío a la cuenta del destinatario. */}
                <View style={s.vinculo}>
                  <Info color={Colors.mutedForeground} size={Sizes.icon.sm} weight="fill" />
                  <Text variant="caption" color="muted" style={s.flex}>
                    {`Si ${sanitizeText(nombre) || 'quien recibe'} tiene EnBus con esa cédula o ese teléfono, verá el envío y su PIN en su app.`}
                  </Text>
                </View>
              </BloqueResumen>

              <Divider />

              <BloqueResumen titulo="Paquete" onEditar={() => setStep(2)}>
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
                    accessibilityLabel="Foto del paquete"
                  />
                ) : null}
              </BloqueResumen>

              <Divider />

              <BloqueResumen titulo="¿Quién paga el envío?" onEditar={() => setStep(2)}>
                <Text variant="bodyStrong">
                  {modalidadPago ? MODALIDAD_PAGO[modalidadPago].corto : '—'}
                </Text>
                <Text variant="caption" color="muted">
                  {modalidadPago ? MODALIDAD_PAGO[modalidadPago].largo : ''}
                </Text>
              </BloqueResumen>
            </Card>

            <View style={s.note}>
              <Info weight="fill" color={Colors.mutedForeground} size={Sizes.icon.md} />
              <Text variant="caption" color="muted" style={s.flex}>
                El costo final lo calcula la taquilla según el peso real del paquete. Al generar el
                código, llévalo a la taquilla y muéstralo para que lo reciban.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <FloatingBar>
        {motivoBloqueo ? (
          <Text
            variant="caption"
            color={step === 2 && modalidadPago ? 'dangerText' : 'muted'}
            align="center"
            style={s.blockReason}
            accessibilityLiveRegion="polite"
          >
            {motivoBloqueo}
          </Text>
        ) : null}
        <Button
          variant="accent"
          fullWidth
          disabled={!canContinue}
          loading={isSubmitting}
          onPress={handleContinue}
          accessibilityLabel={
            motivoBloqueo
              ? `${step === 3 ? 'Generar código QR' : 'Continuar'}. ${motivoBloqueo}`
              : undefined
          }
        >
          {step === 3 ? 'Generar código QR' : 'Continuar'}
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
            <Prohibit size={Sizes.icon.md} color={Colors.dangerText} weight="bold" />
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

function CompactLocation({
  value,
  placeholder,
  tint,
  onPress,
}: {
  value?: string;
  placeholder: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleValue={Motion.press.button}
      style={s.compact}
      accessibilityRole="button"
      accessibilityLabel={`${placeholder}: ${value ?? 'sin seleccionar'}`}
    >
      <MapPin size={Sizes.icon.sm} color={tint} weight="fill" />
      <Text
        variant="bodyStrong"
        size="sm"
        color={value ? 'foreground' : 'muted'}
        numberOfLines={1}
        compact
        style={s.compactText}
      >
        {value ?? placeholder}
      </Text>
    </PressableScale>
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
      <Icon size={Sizes.icon.xl} color={Colors.primaryText} weight="fill" />
      <Text variant="label" style={s.photoOptionLabel}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Tarjeta radio: título, explicación y círculo marcado. */
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

/** Bloque del resumen con su botón "Editar". */
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
        <Text variant="overline" color="muted" uppercase style={s.flex}>
          {titulo}
        </Text>
        <PressableScale
          onPress={onEditar}
          haptic
          hapticType="selection"
          style={s.linkBox}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${titulo.toLowerCase()}`}
        >
          <Text variant="caption" weight="bold" color="foreground" style={s.link}>
            Editar
          </Text>
        </PressableScale>
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  routeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.full,
    padding: Spacing.xs + 2,
  },
  compact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    height: Sizes.control.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
  },
  compactText: {
    flex: 1,
  },
  section: {
    marginTop: Spacing.xl,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sucursalText: {
    marginTop: Spacing.sm,
  },
  sucursal: {
    marginTop: Spacing.sm,
    gap: Spacing.xs / 2,
  },
  sucursalDivided: {
    paddingTop: Spacing.sm,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  link: {
    textDecorationLine: 'underline',
  },
  /** Área táctil cómoda alrededor de un enlace de texto pequeño */
  linkBox: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  costLabel: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  radio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  radioSelected: {
    backgroundColor: Colors.white,
    borderColor: Colors.accent,
  },
  radioCircle: {
    width: Sizes.icon.lg,
    height: Sizes.icon.lg,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.mutedForeground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioCircleSelected: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: Sizes.icon.lg / 2,
    height: Sizes.icon.lg / 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  vinculo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
  },
  photoHelp: {
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
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
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
  },
  photoOptionLabel: {
    textAlign: 'center',
  },
  reviewBlock: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  reviewIcon: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  reviewText: {
    marginTop: Spacing.sm,
    maxWidth: 320,
  },
  bloque: {
    gap: Spacing.xs / 2,
  },
  bloqueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  blockReason: {
    marginBottom: Spacing.sm,
  },
  prohibido: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  prohibidoNota: {
    marginBottom: Spacing.md,
  },
});
