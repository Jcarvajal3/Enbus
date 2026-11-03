import type { User } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { humanizeError } from "@/lib/errores";
import { EmpleadosClient, type Empleado, type InvitacionPendiente, type SucursalOpcion } from "./client";

/** true si la cuenta está bloqueada (desactivada) en este momento. */
function estaBloqueado(bannedUntil: string | null | undefined): boolean {
  return bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
}

const SELECT_INVITACIONES = "id, email, role, sucursal_id, token, expira_at, created_at";

export default async function EmpleadosPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  if (user.role !== "admin_cooperativa") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Solo el administrador de la cooperativa puede ver los empleados.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const invitacionesPendientes = async () => {
    const consulta = supabase
      .from("invitaciones")
      .select(SELECT_INVITACIONES)
      .eq("cooperativa_id", user.cooperativa_id)
      .eq("usado", false)
      .order("created_at", { ascending: false })
      .limit(50);
    const res = await consulta.is("revocada_at", null);
    // 42703: la columna revocada_at aún no existe (migración 20260720000002 sin aplicar).
    if (res.error?.code === "42703") {
      return supabase
        .from("invitaciones")
        .select(SELECT_INVITACIONES)
        .eq("cooperativa_id", user.cooperativa_id)
        .eq("usado", false)
        .order("created_at", { ascending: false })
        .limit(50);
    }
    return res;
  };

  const [perfilesResult, sucursalesResult, invitacionesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre_completo, role, created_at, telefono, sucursal_id")
      .eq("cooperativa_id", user.cooperativa_id)
      .in("role", ["taquillero", "admin_cooperativa"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("sucursales")
      .select("id, nombre, activa")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("nombre", { ascending: true }),
    invitacionesPendientes(),
  ]);

  if (perfilesResult.error) console.error("[EmpleadosPage] perfiles:", perfilesResult.error);
  if (sucursalesResult.error) console.error("[EmpleadosPage] sucursales:", sucursalesResult.error);
  if (invitacionesResult.error) console.error("[EmpleadosPage] invitaciones:", invitacionesResult.error);

  // Correo y bloqueo de cada empleado, uno por uno (sin listar todos los usuarios de EnBus).
  const perfiles = perfilesResult.data ?? [];
  // De a 10 en paralelo: con muchos empleados, cientos de llamadas simultáneas a la API
  // de Auth chocaban con su límite de frecuencia y la lista salía sin correos.
  const cuentas: (User | null)[] = [];
  for (let i = 0; i < perfiles.length; i += 10) {
    const lote = await Promise.all(
      perfiles.slice(i, i + 10).map(async (p) => {
        const { data, error } = await adminSupabase.auth.admin.getUserById(p.id);
        if (error) console.error(`[EmpleadosPage] cuenta ${p.id}:`, error);
        return data?.user ?? null;
      })
    );
    cuentas.push(...lote);
  }
  const empleados: Empleado[] = perfiles.map((p, i) => {
    const cuenta = cuentas[i];
    return {
      id: p.id,
      nombre_completo: p.nombre_completo,
      role: p.role,
      created_at: p.created_at,
      sucursal_id: (p.sucursal_id as string | null) ?? null,
      email: cuenta?.email ?? null,
      isBanned: estaBloqueado(cuenta?.banned_until),
    };
  });

  const error = perfilesResult.error ?? sucursalesResult.error;

  return (
    <EmpleadosClient
      empleados={empleados}
      sucursales={(sucursalesResult.data ?? []) as SucursalOpcion[]}
      invitaciones={(invitacionesResult.data ?? []) as InvitacionPendiente[]}
      cooperativaNombre={user.cooperativa_nombre ?? null}
      currentUserId={user.id}
      errorCarga={error ? humanizeError(error, "cargar los empleados") : null}
      errorInvitaciones={
        invitacionesResult.error ? humanizeError(invitacionesResult.error, "cargar las invitaciones") : null
      }
    />
  );
}
