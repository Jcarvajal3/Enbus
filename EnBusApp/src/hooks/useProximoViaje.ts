/**
 * useProximoViaje — el viaje pagado que sale antes, para la tarjeta "Tu próximo
 * viaje" de Inicio (APP-16).
 *
 * Lee los boletos PAGADO del usuario cuya salida está entre ahora − 30 min (el
 * bus que está saliendo) y ahora + 48 h, los ordena por salida en el cliente y
 * agrupa los asientos de la misma compra. Se recarga al enfocar la pantalla y
 * cuando cambia `boletosActivos` de `ActivityContext` (un pago aprobado, una
 * cancelación…), así que debe usarse dentro del grupo de pestañas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/utils/supabase';
import { formatCity } from '@/src/utils/formatters';
import { useAuth } from '@/src/contexts/AuthContext';
import { useActivity } from '@/src/contexts/ActivityContext';
import type { ProximoViaje } from '@/src/types';

export type { ProximoViaje } from '@/src/types';

const ANTES_MS = 30 * 60 * 1000;
const DESPUES_MS = 48 * 60 * 60 * 1000;

interface FilaProximo {
  id: string;
  codigo_boleto: string | null;
  compra_id: string | null;
  viaje_id: string | null;
  asiento: string | null;
  viajes: {
    fecha_hora_salida: string;
    fecha_hora_llegada_est: string | null;
    rutas: { ciudad_origen: string | null; ciudad_destino: string | null } | null;
  } | null;
  cooperativas: { nombre: string | null; logo_url: string | null } | null;
}

const SELECT = `id, codigo_boleto, compra_id, viaje_id, asiento,
  viajes!inner ( fecha_hora_salida, fecha_hora_llegada_est,
                 rutas ( ciudad_origen, ciudad_destino ) ),
  cooperativas ( nombre, logo_url )`;

/** "9" < "14" < "15A" */
const ordenAsiento = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

const ciudad = (v: string | null | undefined) => {
  const t = formatCity(v);
  return t === '—' ? '' : t;
};

function elegirProximo(filas: FilaProximo[]): ProximoViaje | null {
  const conSalida = filas
    .filter((f) => f.viajes?.fecha_hora_salida && !Number.isNaN(Date.parse(f.viajes.fecha_hora_salida)))
    .sort(
      (a, b) =>
        Date.parse(a.viajes!.fecha_hora_salida) - Date.parse(b.viajes!.fecha_hora_salida)
    );
  const primero = conSalida[0];
  if (!primero?.viajes) return null;

  // Asientos de la misma compra (o, sin compra, del mismo viaje).
  const delGrupo = conSalida
    .filter((f) =>
      primero.compra_id
        ? f.compra_id === primero.compra_id
        : f.id === primero.id || (!!primero.viaje_id && f.viaje_id === primero.viaje_id && !f.compra_id)
    )
    .sort((a, b) => ordenAsiento(a.asiento ?? '', b.asiento ?? ''));
  const cabeza = delGrupo[0] ?? primero;

  return {
    boletoId: cabeza.id,
    codigo: cabeza.codigo_boleto ?? '',
    compraId: primero.compra_id ?? null,
    asientos: delGrupo.map((f) => (f.asiento ?? '').trim()).filter(Boolean),
    salida: primero.viajes.fecha_hora_salida,
    llegada: primero.viajes.fecha_hora_llegada_est ?? null,
    ciudadOrigen: ciudad(primero.viajes.rutas?.ciudad_origen),
    ciudadDestino: ciudad(primero.viajes.rutas?.ciudad_destino),
    cooperativa: (cabeza.cooperativas?.nombre ?? primero.cooperativas?.nombre ?? '').trim(),
    cooperativaLogo: cabeza.cooperativas?.logo_url ?? primero.cooperativas?.logo_url ?? null,
  };
}

export function useProximoViaje(): {
  proximo: ProximoViaje | null;
  loading: boolean;
  recargar(): Promise<void>;
} {
  const { user } = useAuth();
  const { boletosActivos } = useActivity();
  const userId = user?.id;

  const [proximo, setProximo] = useState<ProximoViaje | null>(null);
  const [loading, setLoading] = useState(true);
  const montadoRef = useRef(true);
  /** Descarta respuestas viejas si hay dos lecturas en vuelo. */
  const turnoRef = useRef(0);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    const turno = ++turnoRef.current;
    if (!userId) {
      setProximo(null);
      setLoading(false);
      return;
    }
    const ahora = Date.now();
    try {
      const { data, error } = await supabase
        .from('boletos')
        .select(SELECT)
        .eq('comprador_id', userId)
        .eq('estado', 'PAGADO')
        .gte('viajes.fecha_hora_salida', new Date(ahora - ANTES_MS).toISOString())
        .lte('viajes.fecha_hora_salida', new Date(ahora + DESPUES_MS).toISOString())
        .limit(20);
      if (error) throw error;
      if (!montadoRef.current || turno !== turnoRef.current) return;
      setProximo(elegirProximo((data ?? []) as unknown as FilaProximo[]));
    } catch {
      // La tarjeta es un atajo: sin red se conserva la última que se mostró
      // (el pase sigue a mano en "Mis boletos", que tiene su propio aviso).
      if (!montadoRef.current || turno !== turnoRef.current) return;
    } finally {
      if (montadoRef.current && turno === turnoRef.current) setLoading(false);
    }
  }, [userId]);

  // Al enfocar la pantalla…
  useFocusEffect(
    useCallback(() => {
      void recargar();
    }, [recargar])
  );

  // …y cuando cambia el número de boletos activos (la primera lectura ya la hizo el foco).
  const boletosPreviosRef = useRef(boletosActivos);
  useEffect(() => {
    if (boletosPreviosRef.current === boletosActivos) return;
    boletosPreviosRef.current = boletosActivos;
    void recargar();
  }, [boletosActivos, recargar]);

  return { proximo, loading, recargar };
}
