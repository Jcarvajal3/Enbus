import { createClient } from "@/lib/supabase/server";
import { exigirRolPanel } from "@/lib/supabase/auth-guards";
import { humanizeError } from "@/lib/errores";
import { RutasClient, type Ruta } from "./client";

export default async function RutasPage() {
  // Solo el administrador gestiona las rutas (PN-12).
  const user = await exigirRolPanel(["admin_cooperativa"]);

  const supabase = await createClient();
  const { data: rutas, error } = await supabase
    .from("rutas")
    .select("*")
    .eq("cooperativa_id", user.cooperativa_id)
    .order("created_at", { ascending: false });

  return (
    <RutasClient
      rutas={(rutas ?? []) as Ruta[]}
      errorCarga={error ? humanizeError(error, "cargar las rutas") : null}
    />
  );
}
