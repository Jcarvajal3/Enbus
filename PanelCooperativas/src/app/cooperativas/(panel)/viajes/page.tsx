import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { humanizeError } from "@/lib/errores";
import { ViajesClient } from "./client";

export default async function ViajesPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  const supabase = await createClient();

  const [rutasResult, viajesResult] = await Promise.all([
    supabase
      .from("rutas")
      .select("id, ciudad_origen, ciudad_destino")
      .eq("cooperativa_id", user.cooperativa_id)
      .eq("activa", true),
    supabase
      .from("viajes")
      .select("*, ruta:rutas!ruta_id(estado_origen, ciudad_origen, estado_destino, ciudad_destino, precio_pasaje)")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("fecha_hora_salida", { ascending: false })
  ]);

  // Si falla la carga, la lista no se muestra vacía: el cliente enseña el error con "Reintentar".
  const error = viajesResult.error ?? rutasResult.error;
  if (error) console.error("[ViajesPage] Error al cargar viajes o rutas:", error);

  return (
    <ViajesClient
      viajes={viajesResult.data || []}
      rutasActivas={rutasResult.data || []}
      userRole={user.role}
      errorCarga={error ? humanizeError(error, "cargar los viajes") : null}
    />
  );
}
