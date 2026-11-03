/**
 * boletos/compra/[id] – "Tu compra": todos los boletos de una compra (#25,
 * M-16, APP-34).
 *
 * Se llega aquí al terminar el asistente de `boletos/buscar` (pago registrado
 * o "Apartar y pagar en taquilla"), con `recien = 'pago' | 'reserva'`. Muestra
 * el resumen (ruta, salida, asientos, total) y una fila por boleto con su
 * pasajero y su estado, que abre el pase de abordaje de ese boleto.
 *
 * Datos: `boletos` por `compra_id` (la RLS deja ver al comprador los suyos).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, CheckCircle, Info, Receipt, Storefront, Ticket } from 'phosphor-react-native';
import { PageTransition } from '@/src/components/PageTransition';
import { PressableScale } from '@/src/components/PressableScale';
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  FloatingBar,
  Button,
  LoadingState,
  Monto,
  RouteSummary,
  Screen,
  ScreenHeader,
  SectionLabel,
  StaleBanner,
  StatusBadge,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { humanizeError } from '@/src/utils/errores';
import { getEstadoBoletoVisual, getEstadoReembolso, getEstadoBoletoUi } from '@/src/utils/estados';
import { formatCedula } from '@/src/utils/validation';
import { formatCodigoBoleto } from '@/src/utils/codigos';
import { tasaRefDe } from '@/src/utils/dinero';
import {
  formatHora,
  formatSalidaCorta,
  ordenarAsientos,
  unirAsientos,
} from '@/src/hooks/useCheckoutBoletos';
import type { EstadoBoleto, PagoBoletoEmbed } from '@/src/types';
import { Colors, Motion, Radius, Sizes, Spacing, alpha } from '@/src/theme';

const SELECT_COMPRA = `id, codigo_boleto, asiento, estado, precio, reserva_expira_at, compra_id,
  pasajero_nombre, pasajero_cedula, monto_reembolso, reembolso_procesado, created_at,
  viajes ( fecha_hora_salida, rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min ) ),
  cooperativas ( nombre ),
  pago:pagos!boletos_pago_id_fkey ( id, estado_verificacion, tipo_pago, motivo_rechazo,
    numero_referencia, banco_emisor, monto, monto_bs, moneda, monto_declarado,
    tasa_bcv, tasa_bcv_fecha, created_at )`;

/** Estados de un boleto que siguen siendo parte de la compra. */
const VIVOS: readonly EstadoBoleto[] = ['RESERVADO', 'PAGADO', 'USADO'];

interface BoletoDeCompra {
  id: string;
  codigo_boleto: string | null;
  asiento: string;
  estado: EstadoBoleto;
  precio: number | string | null;
  reserva_expira_at: string | null;
  compra_id: string;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  monto_reembolso: number | string | null;
  reembolso_procesado: boolean | null;
  created_at: string;
  viajes?: {
    fecha_hora_salida?: string;
    rutas?: { ciudad_origen?: string; ciudad_destino?: string; duracion_estimada_min?: number };
  } | null;
  cooperativas?: { nombre?: string } | null;
  pago?: PagoBoletoEmbed | PagoBoletoEmbed[] | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const unico = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default function CompraScreen() {
  const params = useLocalSearchParams<{ id: string; recien?: string }>();
  const compraId = Array.isArray(params.id) ? params.id[0] : params.id;
  const recien = params.recien === 'pago' || params.recien === 'reserva' ? params.recien : null;
  const router = useRouter();

  const [boletos, setBoletos] = useState<BoletoDeCompra[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    if (!compraId || !UUID_RE.test(compraId)) {
      setBoletos([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('boletos')
        .select(SELECT_COMPRA)
        .eq('compra_id', compraId);
      if (err) throw err;
      if (!montadoRef.current) return;
      setBoletos((data ?? []) as unknown as BoletoDeCompra[]);
      setError(null);
    } catch (err) {
      if (__DEV__) console.warn('[compra] Error cargando la compra:', err);
      if (montadoRef.current) setError(humanizeError(err, 'carga'));
    } finally {
      if (montadoRef.current) setLoading(false);
    }
  }, [compraId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // La cooperativa aprueba el pago o vence la reserva: la lista se actualiza sola.
  useEffect(() => {
    if (!compraId || !UUID_RE.test(compraId)) return;
    const channel = supabase
      .channel(`rt:compra:${compraId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boletos', filter: `compra_id=eq.${compraId}` },
        () => {
          void cargar();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [compraId, cargar]);

  const volver = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/(tabs)/boletos');
  }, [router]);

  /**
   * Boletos a mostrar: los vivos de la compra (los asientos que se cambiaron
   * antes de pagar quedan CANCELADO y no cuentan). Si ya no queda ninguno vivo
   * (vencida o cancelada), se muestran todos para explicar qué pasó.
   */
  const visibles = useMemo(() => {
    const todos = [...(boletos ?? [])].sort(
      (a, b) => Number(a.asiento) - Number(b.asiento) || a.asiento.localeCompare(b.asiento)
    );
    const vivos = todos.filter((b) => VIVOS.includes(b.estado));
    if (vivos.length > 0) return vivos;
    // Sin vivos: uno por asiento (el más reciente).
    const porAsiento = new Map<string, BoletoDeCompra>();
    for (const b of todos) {
      const previo = porAsiento.get(b.asiento);
      if (!previo || b.created_at > previo.created_at) porAsiento.set(b.asiento, b);
    }
    return [...porAsiento.values()];
  }, [boletos]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen>
        <LoadingState label="Cargando tu compra…" />
      </Screen>
    );
  }

  if (visibles.length === 0) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Tu compra" onBack={volver} />
        {error ? (
          <ErrorState title="No pudimos cargar tu compra" description={error} onRetry={cargar} />
        ) : (
          <EmptyState
            icon={Receipt}
            title="No encontramos esta compra"
            description="Revisa tus boletos en Mis boletos."
            action={{
              children: 'Ir a Mis boletos',
              variant: 'accent',
              onPress: () => router.dismissTo('/(tabs)/boletos'),
            }}
          />
        )}
      </Screen>
    );
  }

  const primero = visibles[0];
  const viaje = primero.viajes ?? null;
  const ruta = viaje?.rutas;
  const minutos = ruta?.duracion_estimada_min ?? 0;
  const cooperativa = primero.cooperativas?.nombre ?? 'la cooperativa';
  const asientos = ordenarAsientos(visibles.map((b) => b.asiento));
  const n = visibles.length;
  const totalUsd = visibles.reduce((sum, b) => sum + (Number(b.precio) || 0), 0);
  const pago = unico(primero.pago);
  const tasaPago = pago ? tasaRefDe(pago.tasa_bcv, pago.tasa_bcv_fecha) : null;

  const reservados = visibles.filter((b) => b.estado === 'RESERVADO');
  const expiraMin = reservados
    .map((b) => b.reserva_expira_at)
    .filter((v): v is string => !!v)
    .sort()[0];

  // Encabezado según cómo terminó la compra (copy de §5 #25).
  const encabezado =
    recien === 'pago'
      ? {
          icono: CheckCircle,
          tono: 'success' as const,
          titulo: '¡Listo! Registramos tu pago',
          texto:
            'La cooperativa lo revisará y te avisaremos cuando tus boletos queden confirmados.',
        }
      : recien === 'reserva' && reservados.length > 0
        ? {
            icono: Storefront,
            tono: 'info' as const,
            titulo: reservados.length === 1 ? 'Tu asiento está apartado' : 'Tus asientos están apartados',
            texto: expiraMin
              ? `Paga en la taquilla de ${cooperativa} antes de las ${formatHora(expiraMin)} o se liberarán.`
              : `Paga en la taquilla de ${cooperativa} antes de que venza la reserva o se liberarán.`,
          }
        : null;

  const unSoloBoleto = n === 1 && !!primero.codigo_boleto;

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader variant="compact" title="Tu compra" onBack={volver} />

        <ScrollView
          contentContainerStyle={scrollContent({ floatingAction: true, top: Spacing.lg })}
          showsVerticalScrollIndicator={false}
        >
          {error ? <StaleBanner onRetry={() => void cargar()} /> : null}

          {encabezado ? (
            <View
              style={[s.banner, encabezado.tono === 'success' ? s.bannerSuccess : s.bannerInfo]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <encabezado.icono
                size={Sizes.icon.lg}
                color={encabezado.tono === 'success' ? Colors.successText : Colors.infoText}
                weight="fill"
              />
              <View style={s.bannerBody}>
                <Text variant="bodyStrong" color={encabezado.tono === 'success' ? 'successText' : 'infoText'}>
                  {encabezado.titulo}
                </Text>
                <Text variant="secondary" color="foreground">
                  {encabezado.texto}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ── Resumen ─────────────────────────────────────────────────── */}
          <Card padding="md">
            <Text variant="subheading" numberOfLines={1}>
              {primero.cooperativas?.nombre ?? 'Cooperativa'}
            </Text>
            <Divider spacing={Spacing.lg} />
            <RouteSummary
              origen={ruta?.ciudad_origen}
              destino={ruta?.ciudad_destino}
              duration={minutos > 0 ? `${Math.floor(minutos / 60)}h ${minutos % 60}m` : undefined}
            />
            <Divider spacing={Spacing.lg} />
            <View style={s.resumenFila}>
              <Text variant="secondary" color="muted">
                Salida
              </Text>
              <Text variant="bodyStrong" align="right" style={s.resumenValor}>
                {formatSalidaCorta(viaje?.fecha_hora_salida)}
              </Text>
            </View>
            <View style={s.resumenFila}>
              <Text variant="secondary" color="muted">
                Boletos
              </Text>
              <Text variant="bodyStrong" align="right" style={s.resumenValor}>
                {`${n === 1 ? '1 boleto' : `${n} boletos`} · ${
                  n === 1 ? `Asiento ${asientos[0]}` : `Asientos ${unirAsientos(asientos)}`
                }`}
              </Text>
            </View>
            <View style={[s.resumenFila, s.resumenTotal]}>
              <Text variant="bodyStrong">Total</Text>
              {pago && pago.monto_bs != null ? (
                <Monto
                  usd={Number(pago.monto) || totalUsd}
                  bs={Number(pago.monto_bs)}
                  tasa={tasaPago}
                  moneda={pago.moneda}
                  align="right"
                />
              ) : (
                <Monto usd={totalUsd} align="right" />
              )}
            </View>
          </Card>

          {/* ── Boletos ─────────────────────────────────────────────────── */}
          <SectionLabel style={s.seccion}>
            {n === 1 ? 'Tu boleto' : `Tus ${n} boletos`}
          </SectionLabel>
          {visibles.map((b) => (
            <FilaBoleto
              key={b.id}
              boleto={b}
              onPress={() =>
                router.push({
                  pathname: '/boletos/[id]',
                  params: { id: b.codigo_boleto || b.id },
                })
              }
            />
          ))}

          <View style={s.nota}>
            <Info size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
            <Text variant="caption" color="muted" style={s.notaTexto}>
              Cada pasajero necesita su propio pase de abordaje y su cédula para subir al bus.
            </Text>
          </View>
        </ScrollView>

        <FloatingBar>
          {unSoloBoleto ? (
            <Button
              variant="accent"
              icon={Ticket}
              fullWidth
              onPress={() =>
                router.push({
                  pathname: '/boletos/[id]',
                  params: { id: primero.codigo_boleto ?? primero.id },
                })
              }
            >
              Ver pase de abordaje
            </Button>
          ) : (
            <Button
              variant="accent"
              icon={Ticket}
              fullWidth
              onPress={() => router.dismissTo('/(tabs)/boletos')}
            >
              Ir a Mis boletos
            </Button>
          )}
        </FloatingBar>
      </PageTransition>
    </Screen>
  );
}

// ─── Fila de boleto ──────────────────────────────────────────────────────────

function FilaBoleto({ boleto, onPress }: { boleto: BoletoDeCompra; onPress: () => void }) {
  const reembolso = getEstadoReembolso(boleto);
  const estadoUi = getEstadoBoletoUi(boleto);
  const visual = getEstadoBoletoVisual(boleto, { conReembolso: true });
  const nombre = boleto.pasajero_nombre?.trim() || 'Pasajero sin nombre';
  const cedula = formatCedula(boleto.pasajero_cedula);
  const codigo = formatCodigoBoleto(boleto.codigo_boleto);

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={s.fila}
      accessibilityRole="button"
      accessibilityLabel={`Asiento ${boleto.asiento}, ${nombre}, cédula ${cedula}. ${visual.label}. Ver boleto ${codigo}`}
    >
      <View style={s.filaAsiento}>
        <Text variant="overline" color="muted" uppercase compact>
          Asiento
        </Text>
        <Text variant="heading" weight="heavy" compact>
          {boleto.asiento}
        </Text>
      </View>
      <View style={s.filaCuerpo}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {nombre}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {`${cedula} · ${codigo || 'Sin código'}`}
        </Text>
        <View style={s.filaBadge}>
          {reembolso ? (
            <StatusBadge dominio="reembolso" estado={reembolso} />
          ) : (
            <StatusBadge dominio="boleto" estado={estadoUi} />
          )}
        </View>
      </View>
      <CaretRight size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: Sizes.hairline,
  },
  bannerSuccess: {
    backgroundColor: Colors.successLight,
    borderColor: alpha(Colors.success, 0.25),
  },
  bannerInfo: {
    backgroundColor: Colors.infoLight,
    borderColor: alpha(Colors.info, 0.25),
  },
  bannerBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  resumenFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  resumenValor: {
    flexShrink: 1,
  },
  resumenTotal: {
    marginTop: Spacing.sm,
    marginBottom: 0,
  },
  seccion: {
    marginTop: Spacing.xl,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  filaAsiento: {
    alignItems: 'center',
    minWidth: Sizes.iconBox.xl,
  },
  filaCuerpo: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  filaBadge: {
    marginTop: Spacing.xs,
  },
  nota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  notaTexto: {
    flex: 1,
  },
});
