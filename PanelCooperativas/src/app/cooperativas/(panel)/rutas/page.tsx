import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { humanizeError } from "@/lib/errores";
import { RutasClient } from "./client";

export default async function RutasPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  const supabase = await createClient();

  const { data: rutas, error } = await supabase
    .from("rutas")
    .select("*")
    .eq("cooperativa_id", user.cooperativa_id)
    .order("created_at", { ascending: false })
    // Tope de seguridad (PostgREST corta en 1000): una cooperativa no tiene tantas rutas.
    .limit(500);

  if (error) {
    // Antes el error se ignoraba y la pantalla decía "no tienes rutas". error.tsx ofrece "Reintentar".
    console.error("[RutasPage] Error:", error);
    throw new Error(humanizeError(error, "cargar las rutas"));
  }

  return (
    <RutasClient rutas={rutas || []} userRole={user.role} />
  );
}
