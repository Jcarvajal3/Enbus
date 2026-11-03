/**
 * Ayuda (#28, M-52, APP-52): WhatsApp de soporte, "Reportar un problema" y
 * preguntas frecuentes.
 *
 * Se abre desde Perfil ("Ayuda y soporte") y desde el detalle de un boleto o una
 * encomienda con el recurso ya elegido:
 *
 *   router.push({ pathname: '/ayuda', params: { tipo: 'boleto', id, codigo } });
 *
 * `tipo` preselecciona la categoría (boleto, encomienda, pago, cuenta); `id` se
 * envía a `fn_reportar_problema` para que el equipo vea de qué se trata.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  PaperPlaneTilt,
  WhatsappLogo,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PageTransition } from '@/src/components/PageTransition';
import { PressableScale } from '@/src/components/PressableScale';
import { useToast } from '@/src/components/Toast';
import {
  Button,
  Card,
  Chip,
  Field,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { codigoEB, humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { CATEGORIA_REPORTE } from '@/src/utils/estados';
import { formatCodigoBoleto } from '@/src/utils/codigos';
import { SOPORTE_WHATSAPP, abrirSoporteWhatsApp } from '@/src/utils/soporte';
import type { CategoriaReporte, ReporteCreado } from '@/src/types';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

const MINIMO_DESCRIPCION = 10;
const MAXIMO_DESCRIPCION = 1000;

const CATEGORIAS: CategoriaReporte[] = ['PAGO', 'BOLETO', 'ENCOMIENDA', 'CUENTA', 'OTRO'];

/** `tipo` del enlace → categoría preseleccionada. */
const CATEGORIA_POR_TIPO: Record<string, CategoriaReporte> = {
  boleto: 'BOLETO',
  encomienda: 'ENCOMIENDA',
  pago: 'PAGO',
  cuenta: 'CUENTA',
  otro: 'OTRO',
};

/** Respuestas coherentes con lo que la app y la cooperativa hacen de verdad (§5 #27, #32). */
const PREGUNTAS: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: '¿Cuándo me devuelven el dinero?',
    respuesta:
      'Si cancelas un boleto pagado antes de la salida, la cooperativa te devuelve el 95 % del pasaje en 1 a 2 días hábiles, por el mismo medio con que pagaste. Si la cooperativa cancela el viaje, te devuelve el 100 %.',
  },
  {
    pregunta: 'Pagué y mi boleto dice "Pago en verificación"',
    respuesta:
      'La cooperativa está revisando que el pago llegó a su cuenta; tu asiento sigue apartado mientras tanto. Te avisaremos cuando lo confirme. Si pasa más de un día hábil, repórtalo aquí.',
  },
  {
    pregunta: 'Perdí mi PIN de retiro',
    respuesta:
      'Entra a Encomiendas › Para mí y abre el envío: el PIN aparece cuando la encomienda llega a la oficina de destino. Si no la ves en tu app, pídele el PIN a quien te la envió.',
  },
  {
    pregunta: '¿Qué hago si mi pago fue rechazado?',
    respuesta:
      'Abre el boleto o la encomienda y lee el motivo del rechazo. Revisa la referencia, el banco y el monto, y registra el pago de nuevo. Si crees que es un error, repórtalo aquí con la referencia.',
  },
];

function unParam(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor?.trim() || undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Solo un uuid llega a la RPC: un código en `id` haría fallar el reporte entero. */
function uuidONull(v: string | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

export default function AyudaScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ tipo?: string; id?: string; codigo?: string }>();

  const tipo = unParam(params.tipo)?.toLowerCase();
  const recursoId = uuidONull(unParam(params.id));
  const codigo = unParam(params.codigo);

  /** Recurso sobre el que se reporta (solo boleto o encomienda tienen id en la base). */
  const recurso = useMemo(() => {
    if (tipo === 'boleto') {
      return {
        etiqueta: codigo ? `Boleto ${formatCodigoBoleto(codigo)}` : 'Este boleto',
        /** Lo que se añade al saludo de WhatsApp; sin código no aporta nada. */
        contexto: codigo ? `Boleto ${formatCodigoBoleto(codigo)}` : undefined,
        boletoId: recursoId,
        encomiendaId: null,
      };
    }
    if (tipo === 'encomienda') {
      return {
        etiqueta: codigo ? `Encomienda ${codigo}` : 'Esta encomienda',
        contexto: codigo ? `Encomienda ${codigo}` : undefined,
        boletoId: null,
        encomiendaId: recursoId,
      };
    }
    return null;
  }, [tipo, recursoId, codigo]);

  const [categoria, setCategoria] = useState<CategoriaReporte | null>(
    (tipo && CATEGORIA_POR_TIPO[tipo]) || null
  );
  const [descripcion, setDescripcion] = useState('');
  const [errores, setErrores] = useState<{ categoria?: string; descripcion?: string }>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [creado, setCreado] = useState<ReporteCreado | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  const escribirWhatsApp = useCallback(async () => {
    const ok = await abrirSoporteWhatsApp(recurso?.contexto);
    if (!ok) toast.show('error', 'No pudimos abrir WhatsApp. Revisa que esté instalado.');
  }, [recurso, toast]);

  const enviar = useCallback(async () => {
    if (enviandoRef.current) return;

    const texto = descripcion.trim();
    const nuevos: typeof errores = {};
    if (!categoria) nuevos.categoria = 'Elige de qué se trata el problema.';
    if (texto.length < MINIMO_DESCRIPCION) {
      nuevos.descripcion = `Cuéntanos qué pasó (al menos ${MINIMO_DESCRIPCION} caracteres).`;
    }
    setErrores(nuevos);
    setErrorGeneral(null);
    if (Object.keys(nuevos).length > 0 || !categoria) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc('fn_reportar_problema', {
        p_categoria: categoria,
        p_descripcion: texto,
        p_boleto_id: recurso?.boletoId ?? null,
        p_encomienda_id: recurso?.encomiendaId ?? null,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreado(data as ReporteCreado);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const mensaje = humanizeError(err, 'reporte');
      const campo = parseDetalleEB(err).campo;
      if (codigoEB(err) !== 'EB_DEMASIADOS_REPORTES' && campo === 'descripcion') {
        setErrores({ descripcion: mensaje });
      } else if (campo === 'categoria') {
        setErrores({ categoria: mensaje });
      } else {
        // EB_DEMASIADOS_REPORTES trae su propio texto (incluye la salida por WhatsApp).
        setErrorGeneral(mensaje);
      }
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, [categoria, descripcion, recurso]);

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader variant="compact" title="Ayuda" onBack={() => router.back()} />

        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={scrollContent({ top: Spacing.lg })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── WhatsApp (solo si hay número configurado) ───────────────── */}
            {SOPORTE_WHATSAPP ? (
              <Card padding="md" style={s.card}>
                <View style={s.row}>
                  <View style={[s.iconBox, s.iconWhatsApp]}>
                    <WhatsappLogo size={Sizes.icon.lg} color={Colors.successText} weight="fill" />
                  </View>
                  <View style={s.flex}>
                    <Text variant="bodyStrong">Escríbenos por WhatsApp</Text>
                    <Text variant="secondary" color="muted">
                      Para algo urgente, como un viaje que sale hoy.
                    </Text>
                  </View>
                </View>
                <Button
                  variant="secondary"
                  icon={WhatsappLogo}
                  fullWidth
                  onPress={escribirWhatsApp}
                  style={s.cardAction}
                >
                  Abrir WhatsApp
                </Button>
              </Card>
            ) : null}

            {/* ── Reportar un problema ────────────────────────────────────── */}
            <SectionLabel>Reportar un problema</SectionLabel>
            {creado ? (
              <Card padding="md" style={s.card} accessibilityRole="alert">
                <View style={s.row}>
                  <View style={[s.iconBox, s.iconOk]}>
                    <CheckCircle size={Sizes.icon.lg} color={Colors.successText} weight="fill" />
                  </View>
                  <View style={s.flex}>
                    <Text variant="bodyStrong">{`Recibimos tu reporte ${creado.codigo}`}</Text>
                    <Text variant="secondary" color="muted">
                      Te responderemos por WhatsApp o por correo en menos de 24 horas hábiles.
                      Guarda el código por si necesitas escribirnos.
                    </Text>
                  </View>
                </View>
                <Button variant="secondary" fullWidth onPress={() => router.back()} style={s.cardAction}>
                  Volver
                </Button>
              </Card>
            ) : (
              <Card tone="sunken" padding="md" elevated={false} style={s.card}>
                {recurso ? (
                  <Text variant="secondary" style={s.recurso}>
                    <Text variant="secondary" color="muted">
                      Sobre:{' '}
                    </Text>
                    {recurso.etiqueta}
                  </Text>
                ) : null}

                <Text variant="label" style={s.label}>
                  ¿De qué se trata?
                </Text>
                <View style={s.chips} accessibilityRole="radiogroup">
                  {CATEGORIAS.map((c) => (
                    <Chip
                      key={c}
                      label={CATEGORIA_REPORTE[c]}
                      selected={categoria === c}
                      onPress={() => {
                        setCategoria(c);
                        setErrores((e) => ({ ...e, categoria: undefined }));
                      }}
                      accessibilityLabel={`Categoría: ${CATEGORIA_REPORTE[c]}`}
                    />
                  ))}
                </View>
                {errores.categoria ? (
                  <Text variant="caption" color="dangerText" style={s.errorText} accessibilityRole="alert">
                    {errores.categoria}
                  </Text>
                ) : null}

                <Field
                  label="Cuéntanos qué pasó"
                  placeholder="Qué intentabas hacer, qué viste y, si pagaste, la referencia."
                  value={descripcion}
                  onChangeText={(v) => {
                    setDescripcion(v.slice(0, MAXIMO_DESCRIPCION));
                    if (errores.descripcion) setErrores((e) => ({ ...e, descripcion: undefined }));
                  }}
                  error={errores.descripcion}
                  helper={`Mínimo ${MINIMO_DESCRIPCION} caracteres.`}
                  multiline
                  numberOfLines={5}
                  editable={!enviando}
                  containerStyle={s.field}
                />

                {errorGeneral ? (
                  <Text variant="secondary" color="dangerText" style={s.errorGeneral} accessibilityRole="alert">
                    {errorGeneral}
                  </Text>
                ) : null}

                <Button
                  variant="accent"
                  icon={PaperPlaneTilt}
                  fullWidth
                  loading={enviando}
                  onPress={enviar}
                  accessibilityLabel={enviando ? 'Enviando…' : 'Enviar reporte'}
                >
                  {enviando ? 'Enviando…' : 'Enviar reporte'}
                </Button>
              </Card>
            )}

            {/* ── Preguntas frecuentes ────────────────────────────────────── */}
            <SectionLabel>Preguntas frecuentes</SectionLabel>
            <Card tone="sunken" padding="none" elevated={false}>
              {PREGUNTAS.map((p, i) => {
                const expandida = abierta === i;
                return (
                  <View key={p.pregunta} style={i > 0 ? s.faqDivided : undefined}>
                    <PressableScale
                      onPress={() => setAbierta(expandida ? null : i)}
                      haptic
                      hapticType="selection"
                      scaleValue={Motion.press.card}
                      style={s.faqHead}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: expandida }}
                      accessibilityLabel={p.pregunta}
                    >
                      <Text variant="bodyStrong" style={s.flex}>
                        {p.pregunta}
                      </Text>
                      {expandida ? (
                        <CaretUp size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
                      ) : (
                        <CaretDown size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
                      )}
                    </PressableScale>
                    {expandida ? (
                      <Text variant="secondary" color="muted" style={s.faqBody}>
                        {p.respuesta}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </PageTransition>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    marginBottom: Spacing['2xl'],
  },
  cardAction: {
    marginTop: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  iconBox: {
    width: Sizes.iconBox.lg,
    height: Sizes.iconBox.lg,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWhatsApp: {
    backgroundColor: Colors.successLight,
  },
  iconOk: {
    backgroundColor: Colors.successLight,
  },
  recurso: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  errorText: {
    marginTop: Spacing.sm,
  },
  field: {
    marginTop: Spacing.lg,
  },
  errorGeneral: {
    marginBottom: Spacing.md,
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    minHeight: Sizes.control.lg,
  },
  faqBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  faqDivided: {
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },
});
