import { redirect } from "next/navigation";
import { INICIO, type RolPanel } from "@/lib/navigation";
import { getUserProfile } from "./cached";

/**
 * Ensures the current request is authenticated as a super_admin.
 * Throws an Error if not — callers should catch this or let it propagate
 * to the Next.js error boundary.
 *
 * Because getUserProfile() is wrapped in React.cache(), calling this
 * multiple times within a single server render/action is effectively free.
 */
export async function requireSuperAdmin() {
  const user = await getUserProfile();
  if (!user) throw new Error("No autenticado");
  if (user.role !== "super_admin")
    throw new Error("Sin permisos de Super Administrador");
  return user;
}

/**
 * Para páginas del panel de cooperativas con permiso por rol (§2.1 regla 7):
 * sin permiso, `redirect(INICIO)` (nunca texto suelto ni vista de solo lectura).
 * El layout de `(panel)` ya garantizó la sesión y el rol de cooperativa.
 */
export async function exigirRolPanel(roles: RolPanel[]) {
  const user = await getUserProfile();
  if (!user || !roles.includes(user.role as RolPanel)) redirect(INICIO);
  return user;
}
