import { createContext, useContext, useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthContextType = {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  isOffline: boolean;
  signOut: () => Promise<void>;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  initialized: false,
  isOffline: false,
  signOut: async () => { },
});

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Auth provider with two key resilience improvements over the original:
 *
 * 1. **Timeout guard**: `getSession()` races against a 5-second timer.
 *    If Supabase doesn't respond (no network on open), we initialize from the
 *    token already persisted in AsyncStorage by the Supabase client — so the
 *    splash screen never hangs indefinitely.
 *
 * 2. **Offline flag**: exposes `isOffline` so UI can show a connectivity hint
 *    without blocking the rest of the app.
 *
 * PERF-03: `signOut` is wrapped in `useCallback` and the context `value` is
 * wrapped in `useMemo` so that all `useAuth()` consumers only re-render when
 * auth state actually changes — not on every parent render.
 *
 * PERF-09: `getSession()` on foreground is debounced with a 60-second minimum
 * interval to avoid hammering the network on rapid app switches.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Ref semáforo para el timeout de inicialización.
  // Un useState normal crea un closure stale dentro del setTimeout — el valor
  // capturado en el closure siempre sería 'false' (el valor inicial). Con un ref,
  // el timeout lee el valor mutado más reciente, sin importar cuándo se ejecute.
  const initializedRef = useRef(false);

  // PERF-09: Track last foreground refresh to debounce getSession() calls.
  const lastForegroundRefreshRef = useRef<number>(0);
  const FOREGROUND_REFRESH_INTERVAL_MS = 60_000; // 60 seconds minimum between refreshes

  useEffect(() => {
    let cancelled = false;

    // ── Helper: apply a session object to state ───────────────────────────────
    const applySession = (s: Session | null) => {
      if (cancelled) return;
      initializedRef.current = true; // marcar antes del render para que el timeout lo vea
      setSession(s);
      setUser(s?.user ?? null);
      setInitialized(true);
    };

    // ── 1. Race getSession() vs. 5-second timeout ─────────────────────────────
    // El cliente Supabase ya persiste la sesión en SecureStore (expo-secure-store).
    // Si el timeout vence, getSession() puede aún resolver — el listener
    // onAuthStateChange actualizará el estado cuando lo haga.
    const timeoutHandle = setTimeout(() => {
      // Usar el ref (no el estado) para leer el valor actual sin closure stale.
      // Si getSession() ya resolvió en < 5s, initializedRef.current es true
      // y NO sobreescribimos el estado con isOffline=true incorrectamente.
      if (!initializedRef.current && !cancelled) {
        console.warn('[Auth] getSession() timed out — initializing in offline mode');
        setIsOffline(true);
        setInitialized(true); // desbloquear la UI
      }
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(timeoutHandle);
      lastForegroundRefreshRef.current = Date.now();
      setIsOffline(false);
      applySession(s);
    }).catch(() => {
      clearTimeout(timeoutHandle);
      setIsOffline(true);
      setInitialized(true);
    });

    // ── 2. Live auth state listener (login / logout / token refresh) ──────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      setIsOffline(false); // if we got a state change, we have network
    });

    // ── 3. Refresh session when app comes back from background ────────────────
    // Prevents stale tokens after the device wakes from sleep.
    // PERF-09: Debounced — only refresh if 60+ seconds have passed since the
    // last refresh to avoid unnecessary network requests on rapid app switches.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const now = Date.now();
        if (now - lastForegroundRefreshRef.current < FOREGROUND_REFRESH_INTERVAL_MS) {
          return; // Skip — refreshed recently
        }
        lastForegroundRefreshRef.current = now;
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          if (!cancelled) {
            setSession(s);
            setUser(s?.user ?? null);
            setIsOffline(false);
          }
        }).catch(() => {
          // No network on wake — keep current state, mark offline
          if (!cancelled) setIsOffline(true);
        });
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutHandle);
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PERF-03: Stable reference — useCallback prevents consumers from re-rendering
  // when AuthProvider re-renders for unrelated state changes.
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Auth] signOut failed:', e);
    }
  }, []);

  // PERF-03: Memoize the context value object so its reference only changes
  // when one of the auth state values actually changes. Without this, every
  // render of AuthProvider creates a new object and forces ALL consumers
  // (screens, hooks, components) to re-render unnecessarily.
  const value = useMemo(() => ({
    session, user, initialized, isOffline, signOut,
  }), [session, user, initialized, isOffline, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
