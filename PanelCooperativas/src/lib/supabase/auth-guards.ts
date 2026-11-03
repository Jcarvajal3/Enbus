import { redirect } from "next/navigation";
import { INICIO, type RolPanel } from "@/lib/navigation";
import { getUserProfile } from "./cached";

// El guard del super admin (requireSuperAdmin) vive en `@/lib/data/admin-auth`
// (verifica el JWT con getClaims y el perfil en el servidor).

/**
 * Para páginas del panel de cooperativas con permiso por rol (§2.1 regla 7):
 * sin permiso, `redirect(INICIO)` (nunca texto suelto ni vista de solo lectura).
 * El layout de `(panel)` ya garantizó la sesión y el rol de cooperativa; las
 * server actions y RPC vuelven a autorizar por su cuenta.
 */
export async function exigirRolPanel(roles: RolPanel[]) {
  const user = await getUserProfile();
  if (!user || !roles.includes(user.role as RolPanel)) redirect(INICIO);
  return user;
}
