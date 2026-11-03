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
import { CheckCircle, Receipt, Storefront, Ticket } from 'phosphor-react-native';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { useVolver } from '@/src/hooks/useVolver';
import {
  Card,
  Divider,
  EmptyState,
  EntityCard,
  ErrorState,
  FloatingBar,
  Button,
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
import { formatDuracion } from '@/src/utils/formatters';
import { tasaRefDe } from '@/src/utils/dinero';
import {
  formatHora,
  formatSalidaCorta,
  ordenarAsientos,
  unirAsientos,
} from '@/src/hooks/useCheckoutBoletos';
import type { EstadoBoleto, PagoBoletoEmbed } from '@/src/types';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

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

/** Hora de llegada estimada (salida + duración de la ruta), si se conocen ambas. */
function llegadaEstimada(salida: string | undefined, minutos: number): string | undefined {
  const t = salida ? Date.parse(salida) : NaN;
  if (Number.isNaN(t) || !(minutos > 0)) return undefined;
  return formatHora(new Date(t + minutos * 60_000).toISOString()) || undefined;
}

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

  const volver = useVolver('/(tabs)/boletos');

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
        <ScreenHeader variant="compact" title="Tu compra" onBack={volver} />
        <ScreenSkeleton variante="detalle" />
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
              icon: Ticket,
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
          texto: 'Te avisaremos cuando la cooperativa lo confirme.',
        }
      : recien === 'reserva' && reservados.length > 0
        ? {
            icono: Storefront,
            tono: 'info' as const,
            titulo: reservados.length === 1 ? 'Tu asiento está apartado' : 'Tus asientos están apartados',
            texto: expiraMin
              ? `Paga en la taquilla de ${cooperativa} antes de las ${formatHora(expiraMin)}`
              : `Paga en la taquilla de ${cooperativa} antes de que venza la reserva.`,
          }
        : null;

  const unSoloBoleto = n === 1 && !!primero.codigo_boleto;
  /** "Pase de abordaje" solo si está pagado (AN-09). */
  const primeroPagado = getEstadoBoletoUi(primero) === 'PAGADO';

  return (
    <Screen>
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
              <Text variant="label">{encabezado.titulo}</Text>
              <Text variant="secondary" color="muted">
                {encabezado.texto}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Resumen ─────────────────────────────────────────────────── */}
        <Card tone="sunken" padding="md">
          <Text variant="subheading" numberOfLines={1}>
            {primero.cooperativas?.nombre ?? 'Cooperativa'}
          </Text>
          <Divider spacing={Spacing.lg} />
          <RouteSummary
            origen={ruta?.ciudad_origen}
            destino={ruta?.ciudad_destino}
            duration={minutos > 0 ? formatDuracion(minutos) : undefined}
            horaSalida={formatHora(viaje?.fecha_hora_salida) || undefined}
            horaLlegada={llegadaEstimada(viaje?.fecha_hora_salida, minutos)}
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
              {n === 1 ? 'Asiento' : 'Asientos'}
            </Text>
            <Text variant="bodyStrong" align="right" style={s.resumenValor}>
              {unirAsientos(asientos)}
            </Text>
          </View>
          <Divider spacing={Spacing.md} />
          <View style={s.resumenTotal}>
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

        {n > 1 ? (
          <Text variant="caption" color="muted" style={s.nota}>
            Cada pasajero sube al bus con su propio pase y su cédula.
          </Text>
        ) : null}
      </ScrollView>

      <FloatingBar>
        {unSoloBoleto ? (
          <Button
            icon={Ticket}
            fullWidth
            onPress={() =>
              router.push({
                pathname: '/boletos/[id]',
                params: { id: primero.codigo_boleto ?? primero.id },
              })
            }
          >
            {primeroPagado ? 'Ver pase de abordaje' : 'Ver boleto'}
          </Button>
        ) : (
          <Button icon={Ticket} fullWidth onPress={() => router.dismissTo('/(tabs)/boletos')}>
            Ir a Mis boletos
          </Button>
        )}
      </FloatingBar>
    </Screen>
  );
}

// ─── Fila de boleto ──────────────────────────────────────────────────────────

/** Misma fila que Mis boletos (AU-21): estado + código, pasajero, asiento y cédula. */
function FilaBoleto({ boleto, onPress }: { boleto: BoletoDeCompra; onPress: () => void }) {
  const reembolso = getEstadoReembolso(boleto);
  const estadoUi = getEstadoBoletoUi(boleto);
  const visual = getEstadoBoletoVisual(boleto, { conReembolso: true });
  const nombre = boleto.pasajero_nombre?.trim() || 'Pasajero sin nombre';
  const cedula = formatCedula(boleto.pasajero_cedula);
  const codigo = formatCodigoBoleto(boleto.codigo_boleto);

  return (
    <EntityCard
      badge={
        reembolso ? (
          <StatusBadge dominio="reembolso" estado={reembolso} />
        ) : (
          <StatusBadge dominio="boleto" estado={estadoUi} />
        )
      }
      meta={codigo || undefined}
      title={nombre}
      subtitle={`Asiento ${boleto.asiento} · ${cedula}`}
      onPress={onPress}
      accessibilityLabel={`Asiento ${boleto.asiento}, ${nombre}, cédula ${cedula}. ${visual.label}. Ver boleto ${codigo}`}
    />
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  bannerSuccess: {
    backgroundColor: Colors.successLight,
  },
  bannerInfo: {
    backgroundColor: Colors.infoLight,
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
    paddingVertical: Spacing.xs,
  },
  resumenValor: {
    flexShrink: 1,
  },
  resumenTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  seccion: {
    marginTop: Spacing['2xl'],
  },
  nota: {
    marginTop: Spacing.xs,
  },
});
