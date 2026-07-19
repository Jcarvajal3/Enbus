/**
 * useTasaBCV – Hook para obtener la tasa oficial BCV (Bs/USD).
 *
 * Fuente: ve.dolarapi.com (proxy no-oficial que refleja la tasa BCV oficial).
 * La tasa se cachea en memoria durante CACHE_TTL_MS para evitar llamadas excesivas.
 *
 * Uso:
 *   const { tasa, loading, error } = useTasaBCV();
 *   // tasa: número de bolívares por 1 USD  (ej: 91.50)
 *   // Si la API falla, tasa será null y error contendrá el mensaje.
 */

import { useState, useEffect, useRef } from 'react';

// ─── Cache en memoria (sobrevive re-renders, no re-instancias del hook) ────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

let _cachedTasa: number | null = null;
let _cachedAt: number = 0;

// ─── API pública BCV ──────────────────────────────────────────────────────────
const BCV_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

interface TasaResult {
  tasa: number | null;
  loading: boolean;
  error: string | null;
}

export function useTasaBCV(): TasaResult {
  const [tasa, setTasa] = useState<number | null>(_cachedTasa);
  const [loading, setLoading] = useState<boolean>(_cachedTasa === null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    const now = Date.now();

    // Servir desde cache si está fresca
    if (_cachedTasa !== null && now - _cachedAt < CACHE_TTL_MS) {
      setTasa(_cachedTasa);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchTasa = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(BCV_API_URL, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json = await response.json();

        // La API devuelve { promedio: 91.5, ... } — usamos `promedio`
        const valor: number =
          typeof json.promedio === 'number'
            ? json.promedio
            : typeof json.precio === 'number'
            ? json.precio
            : null;

        if (!valor || valor <= 0) {
          throw new Error('Tasa BCV no disponible en la respuesta');
        }

        // Actualizar cache global
        _cachedTasa = valor;
        _cachedAt = Date.now();

        if (!cancelled && isMounted.current) {
          setTasa(valor);
        }
      } catch (err: any) {
        console.warn('[useTasaBCV] Error consultando tasa BCV:', err.message);
        if (!cancelled && isMounted.current) {
          setError(err.message ?? 'Error desconocido');
          // Si hay un valor cacheado antiguo, úsalo como fallback
          if (_cachedTasa !== null) {
            setTasa(_cachedTasa);
          }
        }
      } finally {
        if (!cancelled && isMounted.current) {
          setLoading(false);
        }
      }
    };

    fetchTasa();

    return () => { cancelled = true; };
  }, []);

  return { tasa, loading, error };
}

/**
 * Convierte un monto en bolívares a dólares usando la tasa BCV.
 * Retorna null si la tasa no está disponible.
 */
export function bsToUsd(montoBS: number, tasa: number | null): number | null {
  if (!tasa || tasa <= 0) return null;
  return montoBS / tasa;
}

/**
 * Formatea un monto USD para mostrar al usuario.
 * Ej: formatUSD(12.5) → "12,50 $"
 */
export function formatUSD(amount: number): string {
  return amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' $';
}

/**
 * Formatea un monto Bs para mostrar al usuario.
 * Ej: formatBs(9150) → "9.150,00 Bs"
 */
export function formatBs(amount: number): string {
  return amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' Bs';
}
