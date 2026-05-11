"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { WifiHigh, WifiSlash } from "@phosphor-icons/react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — no magic numbers
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;        // ← was 10s, 30s is plenty
const PROBE_TIMEOUT_MS = 5_000;
const RESTORED_BANNER_TTL_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Hook — useConnectivity
// ─────────────────────────────────────────────────────────────────────────────

type ConnectivityState = {
  online: boolean;
  wasOffline: boolean;
  clearWasOffline: () => void;
};

export function useConnectivity(): ConnectivityState {
  const [online, setOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  // Track previous online state in a ref so the probe callback is always
  // reading the latest value without adding it to the dependency array.
  const onlineRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async () => {
    // Fast-path: if browser says offline, skip the network probe
    if (!navigator.onLine) {
      onlineRef.current = false;
      setOnline(false);
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        // Prevent the probe itself from being served from SW cache
        cache: "no-store",
      });

      const isOnline = res.ok || res.status === 401; // 401 means Supabase is reachable
      if (!onlineRef.current && isOnline) {
        // Was offline, now back — trigger "restored" banner
        setWasOffline(true);
      }
      onlineRef.current = isOnline;
      setOnline(isOnline);
    } catch {
      onlineRef.current = false;
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    // Stable handlers using named functions so removeEventListener works
    const handleOnline = () => probe();
    const handleOffline = () => {
      onlineRef.current = false;
      setOnline(false);
    };

    // Pause polling when tab is hidden to save CPU/battery
    const handleVisibility = () => {
      if (document.hidden) {
        // Tab hidden — stop polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Tab visible — probe immediately + resume polling
        probe();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(probe, POLL_INTERVAL_MS);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Run immediately + start polling
    probe();
    intervalRef.current = setInterval(probe, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [probe]);

  const clearWasOffline = useCallback(() => setWasOffline(false), []);

  return {
    online,
    wasOffline,
    clearWasOffline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner UI — ConnectivityBanner
// ─────────────────────────────────────────────────────────────────────────────

export function ConnectivityBanner() {
  const { online, wasOffline, clearWasOffline } = useConnectivity();

  // Auto-hide the "restored" green banner after TTL
  useEffect(() => {
    if (!wasOffline) return;
    const timer = setTimeout(clearWasOffline, RESTORED_BANNER_TTL_MS);
    return () => clearTimeout(timer);
  }, [wasOffline, clearWasOffline]);

  // ── Offline — red, cannot be dismissed ──────────────────────────────────
  if (!online) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="
          flex items-center justify-center gap-2
          bg-destructive text-destructive-foreground
          px-4 py-2 text-sm font-medium text-center
          animate-in slide-in-from-top duration-300
        "
      >
        <WifiSlash size={16} weight="bold" aria-hidden />
        Sin conexión a internet. Funcionalidad limitada.
      </div>
    );
  }

  // ── Restored — green, auto-hides ─────────────────────────────────────────
  if (wasOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="
          flex items-center justify-center gap-2
          bg-emerald-600 text-white
          px-4 py-2 text-sm font-medium text-center
          animate-in slide-in-from-top duration-300
        "
      >
        <WifiHigh size={16} weight="bold" aria-hidden />
        Conexión restaurada. Sincronizando...
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// requireOnline — wrapper for client-side action guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps an async action so that it throws a user-friendly error when
 * the browser reports no network. Use this around Server Action callers
 * or any mutation that requires connectivity.
 *
 * @example
 * const safeSubmit = requireOnline(async () => { await submitForm(data); });
 * await safeSubmit();
 */
export function requireOnline<T>(action: () => Promise<T>): () => Promise<T> {
  return async () => {
    if (!navigator.onLine) {
      throw new Error("Esta operación requiere conexión a internet.");
    }
    return action();
  };
}
