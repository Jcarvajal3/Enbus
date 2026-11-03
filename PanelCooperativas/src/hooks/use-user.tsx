"use client";

import { createContext, useContext, ReactNode } from "react";

export type UserProfile = {
  id: string;
  role: "taquillero" | "admin_cooperativa" | "super_admin";
  nombre_completo: string;
  cooperativa_id: string | null;
  cooperativa_nombre?: string | null;
  cooperativa_estado?: string | null;
  /** Motivo del último cambio de estado (rechazo, suspensión, baja). Fase 3. */
  cooperativa_motivo_estado?: string | null;
  /** Cuándo cambió el estado por última vez (ISO). Fase 3. */
  cooperativa_estado_cambiado_at?: string | null;
};

type UserContextType = {
  user: UserProfile;
  loading: false;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * UserProvider — pre-seeded with server-fetched data.
 * No client-side auth calls. The server layout already verified and fetched the user.
 */
export function UserProvider({ initialUser, children }: { initialUser: UserProfile; children: ReactNode }) {
  return (
    <UserContext.Provider value={{ user: initialUser, loading: false }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
