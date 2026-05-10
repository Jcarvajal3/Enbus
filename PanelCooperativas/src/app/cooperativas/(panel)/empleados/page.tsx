import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { EmpleadosClient } from "./client";

export default async function EmpleadosPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  if (user.role !== "admin_cooperativa") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Fetch empleados y auth users en paralelo
  const [perfilesResult, authUsersResult, sucursalesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre_completo, role, cooperativa_id, created_at, telefono")
      .eq("cooperativa_id", user.cooperativa_id)
      .in("role", ["taquillero", "admin_cooperativa"])
      .order("created_at", { ascending: false }),
    adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("cooperativa_id", user.cooperativa_id),
  ]);

  // Merge de profiles con auth.users
  const empleados = (perfilesResult.data || []).map(p => {
    const authUser = authUsersResult.data?.users.find(u => u.id === p.id);
    const isBanned = authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false;
    
    return {
      ...p,
      email: authUser?.email || "Sin email",
      isBanned,
    };
  });

  return (
    <EmpleadosClient 
      empleados={empleados} 
      sucursales={sucursalesResult.data || []} 
      currentUserId={user.id} 
    />
  );
}
