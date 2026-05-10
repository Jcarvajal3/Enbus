"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { WifiHigh, WifiSlash } from "@phosphor-icons/react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — no magic numbers
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
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

  const probe = useCallback(async () => {
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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Run immediately + start polling
    probe();
    const interval = setInterval(probe, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
