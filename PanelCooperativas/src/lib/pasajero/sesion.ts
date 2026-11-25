import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cedulaValida, telefonoValido } from "@/lib/ve";
import { urlIngresar } from "./rutas";

export type RolCuenta = "user" | "taquillero" | "admin_cooperativa" | "super_admin";

export type Pasajero = {
  id: string;
  email: string | null;
  rol: RolCuenta;
  nombre: string;
  /** "V-12345678", o null si falta o es provisional (PENDIENTE-…). */
  cedula: string | null;
  /** "0414-1234567", o null si falta o es provisional. */
  telefono: string | null;
  /** Cédula y teléfono válidos (lo exige reservar asientos, igual que la app). */
  perfilCompleto: boolean;
  /** true solo si `rol === "user"`. El staff comparte cookies pero no compra aquí. */
  esPasajero: boolean;
};

const ROLES: readonly RolCuenta[] = ["user", "taquillero", "admin_cooperativa", "super_admin"];

/** Motivo de `/ingresar?motivo=` cuando entra una cuenta del panel al área del pasajero. */
export const MOTIVO_CUENTA_PANEL = "cuenta-panel";

function dato(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  return v && !/^pendiente/i.test(v) ? v : null;
}

/**
 * Sesión verificada (firma del JWT) y perfil de quien navega, o null sin sesión o con la
 * cuenta eliminada. Cacheado por petición: layout y página comparten una sola lectura.
 */
export const obtenerPasajero = cache(async (): Promise<Pasajero | null> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims;
  const id = claims?.sub;
  if (typeof id !== "string" || !id) return null;

  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("role, nombre_completo, cedula_rif, telefono, eliminada_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[obtenerPasajero] No se pudo leer el perfil:", error.code, error.message);
    return null;
  }
  if (!perfil || perfil.eliminada_at) return null;

  const rol = ROLES.find((r) => r === perfil.role);
  if (!rol) return null;

  const cedulaCruda = dato(perfil.cedula_rif);
  const telefonoCrudo = dato(perfil.telefono);
  const cedula = cedulaCruda && cedulaValida(cedulaCruda) ? cedulaCruda : null;
  const telefono = telefonoCrudo && telefonoValido(telefonoCrudo) ? telefonoCrudo : null;

  return {
    id,
    email: typeof claims?.email === "string" ? claims.email : null,
    rol,
    nombre: (perfil.nombre_completo ?? "").trim(),
    cedula,
    telefono,
    perfilCompleto: cedula !== null && telefono !== null,
    esPasajero: rol === "user",
  };
});

/**
 * Para páginas del área del pasajero. Sin sesión → `/ingresar?next=…`. Con una cuenta del
 * panel → `/ingresar?motivo=cuenta-panel`, que explica y ofrece cerrar sesión (esa página no
 * redirige a nadie con sesión de staff, así que no hay bucle).
 */
export async function exigirPasajero(next: string): Promise<Pasajero> {
  const pasajero = await obtenerPasajero();
  if (!pasajero) redirect(urlIngresar(next));
  if (!pasajero.esPasajero) redirect(`/ingresar?motivo=${MOTIVO_CUENTA_PANEL}`);
  return pasajero;
}
