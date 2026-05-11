import { createContext, useContext, useEffect, useState } from 'react';
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
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // ── Helper: apply a session object to state ───────────────────────────────
    const applySession = (s: Session | null) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      setInitialized(true);
    };

    // ── 1. Race getSession() vs. 5-second timeout ─────────────────────────────
    // The Supabase client already persists the session in AsyncStorage.
    // If we time out, `getSession()` will still resolve eventually — and the
    // `onAuthStateChange` listener below will update state when it does.
    const timeoutHandle = setTimeout(() => {
      if (!initialized && !cancelled) {
        console.warn('[Auth] getSession() timed out — initializing in offline mode');
        setIsOffline(true);
        setInitialized(true); // unblock the UI
      }
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(timeoutHandle);
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
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, initialized, isOffline, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
