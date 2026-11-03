/**
 * viajes/[id] – enlace directo a una salida (notificaciones, enlaces viejos).
 *
 * La compra tiene un solo asistente (`boletos/buscar`: Salida · Asientos ·
 * Pasajeros · Pago). Esta ruta solo carga la salida y abre el asistente con su
 * ruta y su fecha, y la salida ya elegida (M-57).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bus } from 'phosphor-react-native';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenHeader,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { fechaVE, formatCity, toDateKey } from '@/src/utils/formatters';
import { humanizeError } from '@/src/utils/errores';

interface ViajeEnlace {
  id: string;
  fecha_hora_salida: string;
  rutas?: { ciudad_origen?: string; ciudad_destino?: string } | null;
}

export default function ViajeEnlaceScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const volver = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const abrir = useCallback(async () => {
    if (!id) {
      setNoEncontrado(true);
      return;
    }
    setError(null);
    setNoEncontrado(false);
    try {
      const { data, error: err } = await supabase
        .from('viajes')
        .select('id, fecha_hora_salida, rutas ( ciudad_origen, ciudad_destino )')
        .eq('id', id)
        .maybeSingle();
      if (err) throw err;
      if (!montadoRef.current) return;

      const viaje = data as unknown as ViajeEnlace | null;
      const ruta = Array.isArray(viaje?.rutas) ? viaje?.rutas[0] : viaje?.rutas;
      if (!viaje || !ruta?.ciudad_origen || !ruta?.ciudad_destino) {
        setNoEncontrado(true);
        return;
      }

      const salida = new Date(viaje.fecha_hora_salida);
      router.replace({
        pathname: '/boletos/buscar',
        params: {
          origen: formatCity(ruta.ciudad_origen),
          destino: formatCity(ruta.ciudad_destino),
          // Día de Venezuela, el mismo con el que `boletos/buscar` lista las salidas.
          fecha: Number.isNaN(salida.getTime()) ? toDateKey(new Date()) : fechaVE(salida),
          viajeId: viaje.id,
        },
      });
    } catch (err) {
      if (__DEV__) console.warn('[viaje] Error cargando la salida:', err);
      if (montadoRef.current) setError(humanizeError(err, 'carga'));
    }
  }, [id, router]);

  useEffect(() => {
    void abrir();
  }, [abrir]);

  if (error) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Salida" onBack={volver} />
        <ErrorState title="No pudimos abrir esta salida" description={error} onRetry={abrir} />
      </Screen>
    );
  }

  if (noEncontrado) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Salida" onBack={volver} />
        <EmptyState
          icon={Bus}
          title="Esta salida ya no está disponible"
          description="Puede que se haya cancelado o que el enlace esté incompleto. Busca otra salida para tu ruta."
          action={{
            children: 'Buscar viaje',
            variant: 'accent',
            onPress: () => router.replace('/boletos/buscar'),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <LoadingState label="Abriendo la salida…" />
    </Screen>
  );
}
