import { createClient } from "@/lib/supabase/server";
import { exigirRolPanel } from "@/lib/supabase/auth-guards";
import { humanizeError } from "@/lib/errores";
import { capacidadHabitual } from "@/lib/capacidad-bus";
import type { Horario } from "@/lib/types/horarios";
import { RutasClient, type Ruta } from "./client";

export default async function RutasPage() {
  // Solo el administrador gestiona las rutas (PN-12).
  const user = await exigirRolPanel(["admin_cooperativa"]);

  const supabase = await createClient();
  const [rutasRes, horariosRes, busesRes] = await Promise.all([
    supabase
      .from("rutas")
      .select("*")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("created_at", { ascending: false })
      // Tope de seguridad (PostgREST corta en 1000): una cooperativa no tiene tantas rutas.
      .limit(500),
    supabase
      .from("horarios")
      .select("id, cooperativa_id, ruta_id, hora_salida, dias, capacidad, vigente_desde, vigente_hasta, activo, created_at, updated_at")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("hora_salida", { ascending: true })
      .limit(500),
    supabase.from("buses").select("asientos").eq("cooperativa_id", user.cooperativa_id).eq("activo", true).limit(500),
  ]);

  // Antes el error se ignoraba y la pantalla decía "no tienes rutas": ahora se
  // registra y la pantalla muestra el error con "Reintentar".
  if (rutasRes.error) console.error("[RutasPage] Error:", rutasRes.error);
  // Sin horarios o sin buses la pantalla sigue siendo útil: solo faltan las salidas.
  if (horariosRes.error) console.error("[RutasPage] horarios:", horariosRes.error);
  if (busesRes.error) console.error("[RutasPage] buses:", busesRes.error);

  const capacidad = capacidadHabitual((busesRes.data ?? []).map((b) => ({ asientos: Number((b as { asientos: number }).asientos) })));

  return (
    <RutasClient
      rutas={(rutasRes.data ?? []) as Ruta[]}
      horarios={(horariosRes.data ?? []) as Horario[]}
      capacidadDefecto={capacidad}
      errorCarga={rutasRes.error ? humanizeError(rutasRes.error, "cargar las rutas") : null}
    />
  );
}
