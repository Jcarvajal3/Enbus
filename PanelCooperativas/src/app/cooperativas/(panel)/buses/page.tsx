import { createClient } from "@/lib/supabase/server";
import { exigirRolPanel } from "@/lib/supabase/auth-guards";
import { humanizeError } from "@/lib/errores";
import type { Bus } from "@/lib/types/operacion";
import { BusesClient } from "./client";

/** "Unidad 2" antes que "Unidad 10". */
const ORDEN_UNIDAD = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export default async function BusesPage() {
  // Solo el administrador gestiona los buses (como las rutas).
  const user = await exigirRolPanel(["admin_cooperativa"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buses")
    .select("id, numero_unidad, placa, asientos, chofer_nombre, chofer_telefono, activo, created_at")
    .eq("cooperativa_id", user.cooperativa_id)
    // Tope de seguridad (PostgREST corta en 1000): una cooperativa no tiene tantos buses.
    .limit(500);

  // Si falla, la pantalla muestra el error con "Reintentar" (no "no tienes buses").
  if (error) console.error("[BusesPage] Error:", error);

  // Activos primero; dentro de cada grupo, por número de unidad.
  const buses = ((data ?? []) as Bus[]).sort(
    (a, b) => Number(b.activo) - Number(a.activo) || ORDEN_UNIDAD.compare(a.numero_unidad, b.numero_unidad)
  );

  return <BusesClient buses={buses} errorCarga={error ? humanizeError(error, "cargar los buses") : null} />;
}
